'use server';

import { getDb } from '@/lib/db';
import { submitSurvey, triggerKitProposal } from '@premura/agents';
import { z } from 'zod';

// Slice B — Server action per submit survey pubblica.
// Token validation + responses persistence. Niente auth richiesta:
// la sicurezza e' nel JWT signed.
//
// Slice C wiring: dopo il submit con alreadySubmitted=false, fire-and-forget
// triggerKitProposal(bookingId). Idempotente: se il kit esiste gia' e non e'
// in stato pending_*, ritorna 'skipped_already_proposed'.

const responsesSchema = z.record(
  z
    .string()
    .min(1)
    .max(40), // qid
  z.union([z.string().max(500), z.array(z.string().max(40)).max(20)]),
);

export type SubmitSurveyActionResult =
  | { ok: true; alreadySubmitted: boolean }
  | { ok: false; reason: 'invalid_token' | 'expired' | 'not_found' | 'invalid_payload' };

export async function submitSurveyAction(
  token: string,
  rawResponses: unknown,
): Promise<SubmitSurveyActionResult> {
  let responses: Record<string, string | string[]>;
  try {
    responses = responsesSchema.parse(rawResponses);
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }

  const { db } = await getDb();
  const result = await submitSurvey(db, token, responses);
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  if (!result.alreadySubmitted) {
    // 05/08: erano due .catch(() => {}) muti. Se la proposta del kit
    // falliva DOPO che l'ospite aveva risposto al sondaggio, non
    // restava traccia da nessuna parte: l'ospite aveva fatto la sua
    // parte e il kit — la ragione per cui il prodotto esiste — non
    // veniva mai proposto. Restano fire-and-forget (la risposta
    // all'ospite non deve aspettarli) ma adesso il fallimento si vede.
    notifyFounderFireAndForget(token).catch((err) => {
      console.error('[survey] notifica founder fallita', {
        bookingId: result.bookingId,
        err: err instanceof Error ? `${err.name} — ${err.message}` : String(err),
      });
    });
    triggerKitProposalFireAndForget(db, result.bookingId).catch((err) => {
      console.error('[survey] proposta kit fallita dopo il sondaggio', {
        bookingId: result.bookingId,
        err: err instanceof Error ? `${err.name} — ${err.message}` : String(err),
      });
    });
  }

  return { ok: true, alreadySubmitted: result.alreadySubmitted };
}

async function triggerKitProposalFireAndForget(
  db: Awaited<ReturnType<typeof getDb>>['db'],
  bookingId: string,
): Promise<void> {
  // Slice C: kit proposal generato post-survey. Costo Sonnet
  // ~€0.05-0.08, ~10-20s. Fire-and-forget cosi' la response della
  // survey non aspetta.
  //
  // 05/08: qui c'era un `catch (_e) {}` con il commento "Errore loggato
  // lato agent (Anthropic SDK)". Era un'assunzione, non un fatto:
  // l'SDK Anthropic LANCIA, non scrive nel nostro logger. Il commento
  // dichiarava una copertura che non esisteva, ed e' il modo piu'
  // efficace per non accorgersi mai di un fallimento.
  //
  // Adesso rilancia: il .catch del chiamante lo registra con il
  // bookingId. Resta best-effort — l'ospite ha gia' avuto la sua
  // risposta — ma smette di essere invisibile.
  await triggerKitProposal(db, bookingId);
}

async function notifyFounderFireAndForget(token: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const operatorEmail = process.env.OPERATOR_EMAIL ?? 'andrea.chiacchio@premura.it';
    await resend.emails.send({
      from: 'Premura <noreply@premura.it>',
      to: operatorEmail,
      subject: 'Premura — Survey completata',
      html: `<p>Una survey pre-arrival e' stata completata.</p><p>Token: <code>${token.slice(0, 16)}...</code></p><p>Apri la dashboard per generare il kit.</p>`,
    });
  } catch (_e) {
    // best-effort, niente throw
  }
}
