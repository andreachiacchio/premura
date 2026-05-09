'use server';

import { getDb } from '@/lib/db';
import { submitSurvey } from '@premura/agents';
import { z } from 'zod';

// Slice B — Server action per submit survey pubblica.
// Token validation + responses persistence. Niente auth richiesta:
// la sicurezza e' nel JWT signed.

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

  // Notifica founder fire-and-forget: lazy import perche' Resend SDK
  // non e' transitive di apps/web. Lo importiamo dinamico via
  // @premura/agents... in realta' Andrea operatore notify e' in
  // apps/api/src/jobs/survey-handler. Per webapp facciamo un'email
  // semplificata qui se RESEND_API_KEY e' configurato.
  if (!result.alreadySubmitted) {
    notifyFounderFireAndForget(token).catch(() => {});
  }

  return { ok: true, alreadySubmitted: result.alreadySubmitted };
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
