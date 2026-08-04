import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getJob } from '@/lib/repositories/gmail-sync-jobs';
import { NextResponse } from 'next/server';

// GET /api/gmail/sync/status?jobId=<uuid>
//
// Ritorna lo stato corrente del sync job. Pollato dal componente
// frontend GmailSyncProgress ogni 1.5s.
//
// Parte A (04/08): la route era senza auth ne' ownership — con un
// jobId qualsiasi restituiva il job di chiunque. Ora: sessione
// obbligatoria e job visibile solo al suo host (404 per gli altri:
// non riveliamo nemmeno l'esistenza).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'jobId query param mancante' }, { status: 400 });
  }

  let hostId: string;
  try {
    hostId = await getCurrentHostId();
  } catch {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const { db } = await getDb();
  const job = await getJob(db, jobId);
  if (!job || job.hostId !== hostId) {
    return NextResponse.json({ error: 'Job non trovato' }, { status: 404 });
  }

  return NextResponse.json(job, { status: 200 });
}
