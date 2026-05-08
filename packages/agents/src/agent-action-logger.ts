import { type Database, agentActions } from '@premura/db';

// Slice 8.2 — Agent action logger.
//
// Decorator/wrapper per chiamate AI: misura latency, intercetta errori,
// calcola costo da usage tokens (Sonnet 4.6 / Haiku 4.5), insert row
// in agent_actions in fire-and-forget (no throw, no block).
//
// Pilastro CLAUDE.md §4 "Observabilita totale": ogni decisione e'
// loggata con ragionamento. La row esce sempre, anche se l'azione
// fallisce (status='error' + errorMessage).
//
// Slice 7a.4: spostato in packages/agents per condivisione apps/web +
// apps/api (worker BullMQ draft-generation). Comportamento invariato.

export type AgentName =
  | 'guest_dna'
  | 'kit_composer'
  | 'message_writer'
  | 'conversation'
  | 'onboarding'
  | 'system';

export type AgentActionStatus = 'success' | 'error' | 'partial';

export type ClaudeUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

// Tabella prezzi Anthropic (USD per million tokens) al 5 mag 2026.
// Aggiornare quando cambiano. Cache write: prezzo input * 1.25.
// Cache read: prezzo input * 0.10.
const MODEL_PRICES_PER_MTOK: Record<string, { in: number; out: number }> = {
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-sonnet-4-5': { in: 3, out: 15 },
  'claude-haiku-4-5-20251001': { in: 0.8, out: 4 },
  'claude-haiku-4-5': { in: 0.8, out: 4 },
  'claude-opus-4-7': { in: 15, out: 75 },
  'claude-opus-4-6': { in: 15, out: 75 },
};

export function calcCostUsd(model: string, usage: ClaudeUsage | undefined | null): number {
  if (!usage) return 0;
  const price = MODEL_PRICES_PER_MTOK[model];
  if (!price) return 0;
  const inputT = usage.input_tokens ?? 0;
  const outputT = usage.output_tokens ?? 0;
  const cacheReadT = usage.cache_read_input_tokens ?? 0;
  const cacheWriteT = usage.cache_creation_input_tokens ?? 0;
  const cost =
    (inputT * price.in) / 1_000_000 +
    (outputT * price.out) / 1_000_000 +
    (cacheWriteT * price.in * 1.25) / 1_000_000 +
    (cacheReadT * price.in * 0.1) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export type LogAgentActionInput<TOutput> = {
  hostId: string;
  agent: AgentName;
  actionType: string;
  bookingId?: string;
  guestProfileId?: string;
  messageId?: string;
  inputSummary?: Record<string, unknown>;
  // Funzione AI da eseguire e tracciare. Riceve callback per setUsage
  // se l'output non include direttamente tokens.
  fn: () => Promise<{
    output: TOutput;
    reasoning?: string;
    model?: string;
    usage?: ClaudeUsage;
  }>;
};

export type LogAgentActionResult<TOutput> = {
  output: TOutput;
  agentActionId: string | null;
  costUsd: number;
  latencyMs: number;
};

// Wrapper principale. Cattura errori dal fn ed esegue insert
// agent_actions con status=error. Re-throw dell'errore per non
// nascondere fallure al chiamante (chi chiama decide se gestire).
export async function logAgentAction<TOutput>(
  db: Database,
  input: LogAgentActionInput<TOutput>,
): Promise<LogAgentActionResult<TOutput>> {
  const start = Date.now();
  try {
    const result = await input.fn();
    const latencyMs = Date.now() - start;
    const model = result.model ?? null;
    const costUsd = model ? calcCostUsd(model, result.usage) : 0;
    const agentActionId = await insertRow(db, {
      hostId: input.hostId,
      agent: input.agent,
      actionType: input.actionType,
      status: 'success',
      bookingId: input.bookingId,
      guestProfileId: input.guestProfileId,
      messageId: input.messageId,
      inputSummary: redactPii(input.inputSummary),
      output: redactPii(result.output as Record<string, unknown>),
      reasoning: result.reasoning ?? null,
      model,
      costUsd,
      latencyMs,
      inputTokens: result.usage?.input_tokens ?? null,
      outputTokens: result.usage?.output_tokens ?? null,
      cacheReadTokens: result.usage?.cache_read_input_tokens ?? null,
      cacheWriteTokens: result.usage?.cache_creation_input_tokens ?? null,
      errorMessage: null,
      errorStack: null,
    });
    return { output: result.output, agentActionId, costUsd, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? (err.stack ?? null) : null;
    // Insert row di errore best-effort: se anche l'insert fallisce,
    // log warn e continua (non vogliamo che il logger nasconda
    // l'errore originale).
    await insertRow(db, {
      hostId: input.hostId,
      agent: input.agent,
      actionType: input.actionType,
      status: 'error',
      bookingId: input.bookingId,
      guestProfileId: input.guestProfileId,
      messageId: input.messageId,
      inputSummary: redactPii(input.inputSummary),
      output: null,
      reasoning: null,
      model: null,
      costUsd: 0,
      latencyMs,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      errorMessage,
      errorStack,
    }).catch((insertErr) => {
      console.warn('[agent-action-logger] insert failed', insertErr);
    });
    throw err;
  }
}

type InsertRowInput = {
  hostId: string;
  agent: AgentName;
  actionType: string;
  status: AgentActionStatus;
  bookingId?: string;
  guestProfileId?: string;
  messageId?: string;
  inputSummary: Record<string, unknown> | null | undefined;
  output: Record<string, unknown> | null;
  reasoning: string | null;
  model: string | null;
  costUsd: number;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  errorMessage: string | null;
  errorStack: string | null;
};

async function insertRow(db: Database, input: InsertRowInput): Promise<string | null> {
  const [row] = await db
    .insert(agentActions)
    .values({
      hostId: input.hostId,
      bookingId: input.bookingId ?? null,
      guestProfileId: input.guestProfileId ?? null,
      messageId: input.messageId ?? null,
      agent: input.agent,
      actionType: input.actionType,
      status: input.status,
      inputSummary: input.inputSummary ?? null,
      output: input.output,
      reasoning: input.reasoning,
      model: input.model,
      costUsd: input.costUsd ? input.costUsd.toFixed(6) : null,
      latencyMs: input.latencyMs,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cacheReadTokens: input.cacheReadTokens,
      cacheWriteTokens: input.cacheWriteTokens,
      errorMessage: input.errorMessage,
      errorStack: input.errorStack,
    })
    .returning({ id: agentActions.id });
  return row?.id ?? null;
}

// PII redaction conservativa: tronca campi notoriamente sensibili
// nelle inputSummary/output. Per slice 8.2 la lista e' minimal:
// body messaggio, email, telefono. La rimozione e' "shallow" (1 livello).
const PII_KEYS = new Set([
  'body',
  'message',
  'guest_message_original',
  'guest_email',
  'guest_phone',
  'phone',
  'email',
  'access_token',
  'authorization',
]);

function redactPii<T extends Record<string, unknown> | null | undefined>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PII_KEYS.has(k.toLowerCase())) {
      if (typeof v === 'string') {
        out[k] = `[redacted:${v.length}ch]`;
      } else if (v != null) {
        out[k] = '[redacted]';
      } else {
        out[k] = null;
      }
    } else if (typeof v === 'string' && v.length > 500) {
      out[k] = `${v.slice(0, 200)}...[truncated:${v.length}ch]`;
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

// Helper per slice 7a.3+: traccia un human override su una row gia
// loggata. Update lazy: se la row non esiste, no-op.
export async function markHumanOverride(db: Database, agentActionId: string): Promise<void> {
  const { eq } = await import('drizzle-orm');
  await db
    .update(agentActions)
    .set({ humanOverride: true })
    .where(eq(agentActions.id, agentActionId));
}
