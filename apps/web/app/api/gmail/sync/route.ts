import { getDb } from '@/lib/db';
import { syncGmailForHost } from '@/lib/gmail-sync-orchestrator';
import { createJob } from '@/lib/repositories/gmail-sync-jobs';
import { getTokenByHostAndEmail } from '@/lib/repositories/google-tokens';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { googleTokens } from '@premura/db';
import { eq } from 'drizzle-orm';
import { NextResponse, after } from 'next/server';

// POST /api/gmail/sync
//
// Avvia un sync Gmail in BACKGROUND e ritorna jobId immediatamente.
// Il client poll-a GET /api/gmail/sync/status?jobId=X per la progress bar.
//
// 30/07 sera: il fire-and-forget con `void promise` NON funziona su
// Vercel — la function viene congelata appena la risposta parte, il
// sync moriva a zero e la riga gmail_sync_jobs restava 'running' per
// sempre (visto su 5 tick consecutivi dopo la re-auth di Andrea).
// `after()` di Next 15 e' il meccanismo giusto: risposta immediata,
// ma la function resta viva finche' il lavoro post-risposta finisce
// (entro maxDuration, 300s qui sotto).
//
// Body: vuoto. hostId derivato dalla sessione Supabase (slice 6 fase 7).
// L'email Gmail target è la prima riga google_tokens per quell'host
// (un host = un Gmail per ora).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Hint per Vercel: prova a tenere viva la function più del default 10s.
// Su hobby tier resta capped a 60s; su Pro 300s.
export const maxDuration = 300;

/**
 * Percorso MACCHINA (30/07): il cron sul worker Fly chiama questa route
 * ogni 15 minuti con `Authorization: Bearer ${GMAIL_SYNC_CRON_SECRET}`.
 * In quel caso il sync parte per TUTTI gli host con un Gmail collegato.
 * Senza secret configurato lato Vercel il percorso e' spento: si ricade
 * sempre sull'auth di sessione.
 */
async function runMachineSync(req: Request): Promise<NextResponse | null> {
  const secret = process.env.GMAIL_SYNC_CRON_SECRET?.trim();
  if (!secret) return null;
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${secret}`) return null;

  const serverClient = await getDb();
  const { db } = serverClient;
  const tokens = await db
    .select({ hostId: googleTokens.hostId, googleEmail: googleTokens.googleEmail })
    .from(googleTokens);

  const jobIds: string[] = [];
  for (const t of tokens) {
    const job = await createJob(db, t.hostId, t.googleEmail);
    jobIds.push(job.id);
    after(async () => {
      try {
        await syncGmailForHost(serverClient, t.hostId, t.googleEmail, { reuseJobId: job.id });
      } catch (err) {
        console.error('[gmail-sync] orchestrator background error (cron)', {
          jobId: job.id,
          err,
        });
      }
    });
  }
  return NextResponse.json({ jobIds, hosts: tokens.length }, { status: 202 });
}

export async function POST(req: Request): Promise<NextResponse> {
  const machine = await runMachineSync(req);
  if (machine) return machine;

  // Slice 6 fase 7: hostId dalla sessione Supabase. Il middleware non
  // intercetta /api/* (lascia passare le route handler che decidono
  // l'auth interna), quindi qui facciamo il check authoritativo.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }
  const hostId = user.id;

  const serverClient = await getDb();
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

  // 4. Lancia orchestrator DOPO la risposta ma dentro la vita della
  // function (after(), vedi commento in testa). L'errore viene comunque
  // scritto in gmail_sync_jobs.fatal_error dall'orchestrator.
  after(async () => {
    try {
      await syncGmailForHost(serverClient, hostId, googleEmail, { reuseJobId: job.id });
    } catch (err) {
      console.error('[gmail-sync] orchestrator background error', { jobId: job.id, err });
    }
  });

  // 5. Risposta immediata col jobId. Client polla /status?jobId=...
  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
