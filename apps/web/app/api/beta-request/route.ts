import { type BetaRequestResponse, betaRequestBodySchema } from '@/lib/beta-request-schema';
import { sendEmailViaResend } from '@/lib/email-resend';
import { consume, extractClientIp } from '@/lib/rate-limit';
import { type ServerClient, createServerClient, waitlist } from '@premura/db';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

// Slice I — POST /api/beta-request.
//
// Sostituisce funzionalmente waitlist legacy: la landing v2 chiede
// "Richiedi accesso beta" anziché "Entra nella waitlist".
//
// Effetti collaterali:
//  1. Insert in waitlist con requested_beta_access=true, source='landing_v2'.
//  2. Email Resend a OPERATOR_EMAIL (founder) con i dati.
//  3. Email Resend auto-reply al richiedente con messaggio caldo "ti
//     rispondo entro 24h".
//
// Idempotenza: stessa email duplicata risponde {ok:true, duplicate:true}
// senza spedire email (evita spam).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL ?? 'andrea.chiacchio@premura.it';
const SENDER_EMAIL = process.env.PREMURA_NOREPLY_EMAIL ?? 'Premura <noreply@premura.it>';

let clientPromise: Promise<ServerClient> | null = null;

function getClient(): Promise<ServerClient> {
  if (!clientPromise) {
    clientPromise = Promise.resolve(createServerClient());
  }
  return clientPromise;
}

function jsonResponse(body: BetaRequestResponse, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, init);
}

export async function POST(request: Request): Promise<NextResponse> {
  // ─── Rate limit ───────────────────────────────────────────────
  const ip = extractClientIp(request.headers);
  const rl = consume(`beta-request:${ip}`);
  if (!rl.allowed) {
    return jsonResponse(
      {
        ok: false,
        error: 'rate_limit',
        message: 'Troppi tentativi. Riprova tra qualche minuto.',
      },
      {
        status: 429,
        headers: { 'retry-after': String(rl.retryAfterSeconds) },
      },
    );
  }

  // ─── Parse + validazione ─────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonResponse(
      { ok: false, error: 'validation', message: 'Body non valido.' },
      { status: 400 },
    );
  }

  const parsed = betaRequestBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return jsonResponse(
      {
        ok: false,
        error: 'validation',
        message: firstIssue ?? 'Controlla i campi compilati.',
      },
      { status: 400 },
    );
  }

  const referrer = request.headers.get('referer')?.slice(0, 512) ?? null;

  // ─── Insert (idempotente per email) ──────────────────────────
  try {
    const { db } = await getClient();

    const existing = await db
      .select({ id: waitlist.id })
      .from(waitlist)
      .where(eq(waitlist.email, parsed.data.email))
      .limit(1);

    if (existing.length > 0) {
      return jsonResponse({ ok: true, duplicate: true });
    }

    const notes = parsed.data.cityAndType ? `Città/tipo: ${parsed.data.cityAndType}` : null;

    await db.insert(waitlist).values({
      email: parsed.data.email,
      fullName: parsed.data.fullName,
      propertyCount: parsed.data.propertyCount,
      source: 'landing_v2',
      referrer,
      requestedBetaAccess: true,
      notes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('waitlist_email_unique')) {
      return jsonResponse({ ok: true, duplicate: true });
    }
    console.error('[beta-request] insert failed', err);
    return jsonResponse(
      {
        ok: false,
        error: 'server',
        message: 'Qualcosa non va dalla nostra parte. Riprova tra poco.',
      },
      { status: 500 },
    );
  }

  // ─── Email founder + auto-reply (fire-and-forget) ────────────
  // Errore email NON fa fallire la request: il lead e' gia' salvato in DB,
  // Andrea puo' vederlo manualmente. Log a console per visibilità.
  void Promise.all([
    sendFounderNotification(parsed.data, referrer),
    sendAutoReply(parsed.data.email, parsed.data.fullName),
  ]).catch((err) => {
    console.warn('[beta-request] email dispatch failed', err);
  });

  return jsonResponse({ ok: true, duplicate: false });
}

async function sendFounderNotification(
  data: {
    email: string;
    fullName: string;
    propertyCount: number;
    cityAndType?: string;
  },
  referrer: string | null,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  const cityLine = data.cityAndType
    ? `<p><strong>Città/tipo:</strong> ${escapeHtml(data.cityAndType)}</p>`
    : '';
  const refLine = referrer
    ? `<p style="color:#666;font-size:12px;">Referrer: ${escapeHtml(referrer)}</p>`
    : '';
  const html = `<!doctype html><html><body style="font-family:sans-serif;color:#1F3A4D;">
<h2 style="margin-bottom:8px;">Nuova richiesta beta Premura</h2>
<p><strong>${escapeHtml(data.fullName)}</strong> &middot; ${escapeHtml(data.email)}</p>
<p><strong>Strutture:</strong> ${data.propertyCount}</p>
${cityLine}
${refLine}
<p style="margin-top:24px;">Risponde tu entro 24h. La row è in <code>waitlist</code> con <code>requested_beta_access=true</code>.</p>
</body></html>`;
  await sendEmailViaResend({
    from: SENDER_EMAIL,
    to: OPERATOR_EMAIL,
    subject: `Premura — Richiesta beta: ${data.fullName} (${data.propertyCount} strutture)`,
    html,
    replyTo: data.email,
    tags: [{ name: 'kind', value: 'beta_request_founder' }],
  });
}

async function sendAutoReply(email: string, fullName: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  const firstName = fullName.split(/\s+/)[0] ?? fullName;
  const html = `<!doctype html><html><body style="font-family:sans-serif;color:#1F3A4D;font-size:16px;line-height:1.55;">
<p>Ciao ${escapeHtml(firstName)},</p>
<p>grazie per aver chiesto accesso alla beta di Premura.</p>
<p>Ti rispondo io personalmente entro 24h. Stiamo accogliendo i primi host
con calma — voglio capire bene il tuo caso prima di farti entrare.</p>
<p>A presto,<br/>Andrea<br/><em>fondatore di Premura</em></p>
<p style="margin-top:32px;color:#888;font-size:12px;">
  Se non hai richiesto tu questo accesso, ignora questa email.
</p>
</body></html>`;
  await sendEmailViaResend({
    from: SENDER_EMAIL,
    to: email,
    subject: 'Grazie — ti rispondo entro 24h',
    html,
    replyTo: OPERATOR_EMAIL,
    tags: [{ name: 'kind', value: 'beta_request_autoreply' }],
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
