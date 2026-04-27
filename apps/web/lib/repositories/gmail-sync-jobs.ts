import { eq, sql } from 'drizzle-orm';
import { gmailSyncJobs, type Database, type JobErrorEntry } from '@premura/db';

// Repository per gmail_sync_jobs: progress bar + audit per il sync.
// Tutte le mutazioni sono atomiche (un solo UPDATE per chiamata).

export type SyncJobStats = {
  totalEmails: number;
  processedEmails: number;
  enrichedCount: number;
  createdCount: number;
  skippedPast: number;
  skippedNoMatch: number;
  skippedNotConfirmation: number;
  cancelledCount: number;
  guestProfilesCreated: number;
  guestProfilesUpdated: number;
};

export type SyncJob = {
  id: string;
  hostId: string;
  googleEmail: string;
  status: 'running' | 'completed' | 'failed';
  totalEmails: number;
  processedEmails: number;
  enrichedCount: number;
  createdCount: number;
  skippedPast: number;
  skippedNoMatch: number;
  skippedNotConfirmation: number;
  cancelledCount: number;
  guestProfilesCreated: number;
  guestProfilesUpdated: number;
  errorLog: JobErrorEntry[];
  fatalError: string | null;
  truncated: boolean;
  startedAt: Date;
  completedAt: Date | null;
};

export async function createJob(
  db: Database,
  hostId: string,
  googleEmail: string,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(gmailSyncJobs)
    .values({ hostId, googleEmail, status: 'running' })
    .returning({ id: gmailSyncJobs.id });
  if (!row) throw new Error('createJob: INSERT ... RETURNING vuoto');
  return { id: row.id };
}

// Aggiorna total_emails (e flag truncated) una volta sola dopo la query Gmail.
export async function setTotalEmails(
  db: Database,
  jobId: string,
  total: number,
  truncated = false,
): Promise<void> {
  await db
    .update(gmailSyncJobs)
    .set({ totalEmails: total, truncated, updatedAt: new Date() })
    .where(eq(gmailSyncJobs.id, jobId));
}

// Increment atomico di processed_emails + statistiche dopo ogni email.
// Usato dall'orchestrator nel loop principale.
export type SyncIncrement = Partial<{
  processedEmails: number;
  enrichedCount: number;
  createdCount: number;
  skippedPast: number;
  skippedNoMatch: number;
  skippedNotConfirmation: number;
  cancelledCount: number;
  guestProfilesCreated: number;
  guestProfilesUpdated: number;
}>;

export async function incrementJob(
  db: Database,
  jobId: string,
  inc: SyncIncrement,
): Promise<void> {
  const set: Record<string, ReturnType<typeof sql>> = { updated_at: sql`NOW()` };
  if (inc.processedEmails)
    set.processed_emails = sql`${gmailSyncJobs.processedEmails} + ${inc.processedEmails}`;
  if (inc.enrichedCount)
    set.enriched_count = sql`${gmailSyncJobs.enrichedCount} + ${inc.enrichedCount}`;
  if (inc.createdCount)
    set.created_count = sql`${gmailSyncJobs.createdCount} + ${inc.createdCount}`;
  if (inc.skippedPast)
    set.skipped_past = sql`${gmailSyncJobs.skippedPast} + ${inc.skippedPast}`;
  if (inc.skippedNoMatch)
    set.skipped_no_match = sql`${gmailSyncJobs.skippedNoMatch} + ${inc.skippedNoMatch}`;
  if (inc.skippedNotConfirmation)
    set.skipped_not_confirmation = sql`${gmailSyncJobs.skippedNotConfirmation} + ${inc.skippedNotConfirmation}`;
  if (inc.cancelledCount)
    set.cancelled_count = sql`${gmailSyncJobs.cancelledCount} + ${inc.cancelledCount}`;
  if (inc.guestProfilesCreated)
    set.guest_profiles_created = sql`${gmailSyncJobs.guestProfilesCreated} + ${inc.guestProfilesCreated}`;
  if (inc.guestProfilesUpdated)
    set.guest_profiles_updated = sql`${gmailSyncJobs.guestProfilesUpdated} + ${inc.guestProfilesUpdated}`;

  // Drizzle .set() richiede chiavi camelCase del modello: traduciamo.
  const camel: Record<string, unknown> = {};
  if (set.processed_emails) camel.processedEmails = set.processed_emails;
  if (set.enriched_count) camel.enrichedCount = set.enriched_count;
  if (set.created_count) camel.createdCount = set.created_count;
  if (set.skipped_past) camel.skippedPast = set.skipped_past;
  if (set.skipped_no_match) camel.skippedNoMatch = set.skipped_no_match;
  if (set.skipped_not_confirmation) camel.skippedNotConfirmation = set.skipped_not_confirmation;
  if (set.cancelled_count) camel.cancelledCount = set.cancelled_count;
  if (set.guest_profiles_created) camel.guestProfilesCreated = set.guest_profiles_created;
  if (set.guest_profiles_updated) camel.guestProfilesUpdated = set.guest_profiles_updated;
  camel.updatedAt = new Date();

  if (Object.keys(camel).length <= 1) return; // niente da incrementare

  await db
    .update(gmailSyncJobs)
    .set(camel)
    .where(eq(gmailSyncJobs.id, jobId));
}

// Append a un'entry di error_log (non blocca il job).
export async function appendErrorLog(
  db: Database,
  jobId: string,
  entry: JobErrorEntry,
): Promise<void> {
  await db
    .update(gmailSyncJobs)
    .set({
      errorLog: sql`${gmailSyncJobs.errorLog} || ${JSON.stringify([entry])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(gmailSyncJobs.id, jobId));
}

// Mark complete o failed con stats finali / errore terminale.
export async function completeJob(
  db: Database,
  jobId: string,
  status: 'completed' | 'failed',
  fatalError?: string,
): Promise<void> {
  await db
    .update(gmailSyncJobs)
    .set({
      status,
      fatalError: fatalError ?? null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(gmailSyncJobs.id, jobId));
}

export async function getJob(db: Database, jobId: string): Promise<SyncJob | null> {
  const [row] = await db
    .select()
    .from(gmailSyncJobs)
    .where(eq(gmailSyncJobs.id, jobId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    hostId: row.hostId,
    googleEmail: row.googleEmail,
    status: row.status,
    totalEmails: row.totalEmails,
    processedEmails: row.processedEmails,
    enrichedCount: row.enrichedCount,
    createdCount: row.createdCount,
    skippedPast: row.skippedPast,
    skippedNoMatch: row.skippedNoMatch,
    skippedNotConfirmation: row.skippedNotConfirmation,
    cancelledCount: row.cancelledCount,
    guestProfilesCreated: row.guestProfilesCreated,
    guestProfilesUpdated: row.guestProfilesUpdated,
    errorLog: row.errorLog,
    fatalError: row.fatalError,
    truncated: row.truncated,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}
