import Anthropic from '@anthropic-ai/sdk';

// Lazy init dell'SDK: evita il side-effect top-level `new Anthropic({...})`
// che in env browser-like (jsdom dei test client) blocca il runner SDK
// per evitare leak credenziali. La factory e' idempotente, l'istanza
// viene creata alla prima chiamata e cachata per i successivi call site.
let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _client;
}

export type ClaudeModel = 'opus' | 'fast';

const MODEL_MAP: Record<ClaudeModel, string> = {
  opus: process.env.CLAUDE_MODEL_PRIMARY ?? 'claude-opus-4-7',
  fast: process.env.CLAUDE_MODEL_FAST ?? 'claude-haiku-4-5-20251001',
};

// Rough pricing (update when Anthropic changes rates)
const PRICING_USD_PER_MTOK: Record<ClaudeModel, { input: number; output: number }> = {
  opus: { input: 15, output: 75 },
  fast: { input: 0.8, output: 4 },
};

type RunOptions = {
  system: string;
  messages: Anthropic.MessageParam[];
  model?: ClaudeModel;
  maxTokens?: number;
  tools?: Anthropic.Tool[];
  temperature?: number;
};

export type RunResult = {
  text: string;
  toolUses: Array<{ name: string; input: Record<string, unknown> }>;
  model: string;
  costUsd: number;
  raw: Anthropic.Message;
};

/**
 * Execute a single Claude completion and return a normalized result
 * including cost tracking for observability.
 */
export async function runClaude(options: RunOptions): Promise<RunResult> {
  const { system, messages, model = 'opus', maxTokens = 2048, tools, temperature } = options;
  const modelId = MODEL_MAP[model];

  const response = await getAnthropic().messages.create({
    model: modelId,
    max_tokens: maxTokens,
    system,
    messages,
    tools,
    temperature,
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const toolUses = response.content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
    .map((b) => ({ name: b.name, input: b.input as Record<string, unknown> }));

  const pricing = PRICING_USD_PER_MTOK[model];
  const costUsd =
    (response.usage.input_tokens * pricing.input + response.usage.output_tokens * pricing.output) /
    1_000_000;

  return { text, toolUses, model: modelId, costUsd, raw: response };
}
