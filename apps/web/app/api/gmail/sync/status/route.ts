import { NextResponse } from 'next/server';
import { createServerClient, type ServerClient } from '@premura/db';
import { getJob } from '@/lib/repositories/gmail-sync-jobs';

// GET /api/gmail/sync/status?jobId=<uuid>
//
// Ritorna lo stato corrente del sync job. Pollato dal componente
// frontend GmailSyncProgress ogni 1.5s.
//
// Response shape:
//   {
//     jobId, status, totalEmails, processedEmails,
//     enrichedCount, createdCount, skippedPast, skippedNoMatch,
//     skippedNotConfirmation, cancelledCount,
//     guestProfilesCreated, guestProfilesUpdated,
//     errorLog: [], fatalError: string | null,
//     startedAt, completedAt
//   }

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let clientPromise: Promise<ServerClient> | null = null;
function getClient(): Promise<ServerClient> {
  if (!clientPromise) clientPromise = Promise.resolve(createServerClient());
  return clientPromise;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'jobId query param mancante' }, { status: 400 });
  }

  const { db } = await getClient();
  const job = await getJob(db, jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job non trovato' }, { status: 404 });
  }

  return NextResponse.json(job, { status: 200 });
}
