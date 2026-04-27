import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { createServerClient, googleTokens, type ServerClient } from '@premura/db';
import { getTokenByHostAndEmail } from '@/lib/repositories/google-tokens';
import { createJob } from '@/lib/repositories/gmail-sync-jobs';
import { syncGmailForHost } from '@/lib/gmail-sync-orchestrator';

// POST /api/gmail/sync
//
// Avvia un sync Gmail in BACKGROUND e ritorna jobId immediatamente.
// Il client poll-a GET /api/gmail/sync/status?jobId=X per la progress bar.
//
// Architettura: Opzione B (M2a.3 Fase 2). NIENTE BullMQ in questa fase.
// Il job orchestrator gira nel processo Next.js attuale via void
// promise (fire-and-forget). Limitazione nota su Vercel hobby:
// function timeout 60s. 50 email × 3-5s Claude = ~3 min, eccede il
// timeout in cloud. Per il pilot Andrea testa localmente con
// `next dev` (no timeout). M3 migrerà a worker dedicato.
// Documentato in docs/KNOWN-LIMITS.md §8.
//
// Body: vuoto. L'host viene letto da DEV_HOST_ID env (no auth ancora).
// L'email Gmail target è la prima riga google_tokens per quell'host
// (un host = un Gmail per ora).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Hint per Vercel: prova a tenere viva la function più del default 10s.
// Su hobby tier resta capped a 60s; su Pro 300s.
export const maxDuration = 300;

let clientPromise: Promise<ServerClient> | null = null;
function getClient(): Promise<ServerClient> {
  if (!clientPromise) clientPromise = Promise.resolve(createServerClient());
  return clientPromise;
}

export async function POST(): Promise<NextResponse> {
  const hostId = process.env.DEV_HOST_ID;
  if (!hostId) {
    return NextResponse.json(
      { error: 'DEV_HOST_ID non configurato (M2a.2 introdurrà auth reale)' },
      { status: 500 },
    );
  }

  const serverClient = await getClient();
  const { db } = serverClient;

  // 1. Trova il googleEmail collegato a questo host (per ora 1:1).
  const tokenRows = await db
    .select({ googleEmail: googleTokens.googleEmail })
    .from(googleTokens)
    .where(eq(googleTokens.hostId, hostId))
    .limit(1);
  const googleEmail = tokenRows[0]?.googleEmail;
  if (!googleEmail) {
    return NextResponse.json(
      { error: 'Nessun Gmail collegato per questo host. Vai a /connect-gmail' },
      { status: 400 },
    );
  }

  // 2. Verifica che il token sia decifrabile (TOKEN_ENCRYPTION_KEY ok).
  const token = await getTokenByHostAndEmail(db, hostId, googleEmail);
  if (!token) {
    return NextResponse.json(
      { error: 'google_token non decifrabile (key rotation? riprova /connect-gmail)' },
      { status: 500 },
    );
  }

  // 3. Crea il record gmail_sync_jobs UP-FRONT per ottenere il jobId.
  // L'orchestrator riuserà questo jobId via options.reuseJobId.
  const job = await createJob(db, hostId, googleEmail);

  // 4. Lancia orchestrator in BACKGROUND (fire-and-forget).
  // L'await sull'errore evita warning Node "unhandled rejection";
  // l'errore viene comunque scritto in gmail_sync_jobs.fatal_error.
  void syncGmailForHost(serverClient, hostId, googleEmail, {
    reuseJobId: job.id,
  }).catch((err) => {
    console.error('[gmail-sync] orchestrator background error', { jobId: job.id, err });
  });

  // 5. Risposta immediata col jobId. Client polla /status?jobId=...
  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
