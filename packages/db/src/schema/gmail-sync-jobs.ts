import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

// Stato di un job di sync Gmail. Popolato da
// apps/web/lib/gmail-sync-orchestrator.ts.
export const gmailSyncJobStatusEnum = pgEnum('gmail_sync_job_status', [
  'running',
  'completed',
  'failed',
]);

// Tabella di osservabilità per i sync Gmail. Una riga per ogni POST
// /api/gmail/sync. Non è una queue (niente lock, niente retry):
// il job è eseguito sincrono dal route handler. Serve solo a:
//   - permettere al frontend di pollare il progresso (progress bar);
//   - lasciare audit trail per debug ("perché 3 prenotazioni in meno?").
//
// Idempotenza job-level: niente. Se l'host clicca POST due volte,
// partono due job; il secondo troverà tutto già upserted (idempotenza
// è a livello bookings/guest_profiles, non job).
export const gmailSyncJobs = pgTable(
  'gmail_sync_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK logica a hosts. Senza vincolo runtime perché coerente con
    // google_tokens.host_id (vedi rationale in google-tokens.ts).
    hostId: uuid('host_id').notNull(),

    googleEmail: varchar('google_email', { length: 255 }).notNull(),

    status: gmailSyncJobStatusEnum('status').notNull().default('running'),

    // Conteggi popolati durante il sync.
    // total_emails = numero di message ID trovati dalla query Gmail.
    // processed_emails incrementa man mano (per progress bar lato client).
    totalEmails: integer('total_emails').notNull().default(0),
    processedEmails: integer('processed_emails').notNull().default(0),

    // Statistiche finali.
    enrichedCount: integer('enriched_count').notNull().default(0),
    createdCount: integer('created_count').notNull().default(0),
    skippedPast: integer('skipped_past').notNull().default(0),
    skippedNoMatch: integer('skipped_no_match').notNull().default(0),
    skippedNotConfirmation: integer('skipped_not_confirmation').notNull().default(0),
    cancelledCount: integer('cancelled_count').notNull().default(0),
    guestProfilesCreated: integer('guest_profiles_created').notNull().default(0),
    guestProfilesUpdated: integer('guest_profiles_updated').notNull().default(0),

    // Errori per singola email: { messageId, stage, error } — non blocca
    // il job, le altre email continuano.
    errorLog: jsonb('error_log').$type<JobErrorEntry[]>().notNull().default([]),

    // Errore fatale che ha terminato il job (es. token scaduto, Anthropic
    // unreachable). Quando popolato, status='failed'.
    fatalError: text('fatal_error'),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('gmail_sync_jobs_host_idx').on(t.hostId),
    index('gmail_sync_jobs_status_idx').on(t.status),
    index('gmail_sync_jobs_created_at_idx').on(t.createdAt),
  ],
);

export type JobErrorEntry = {
  messageId: string;
  stage: 'fetch' | 'parse' | 'match' | 'upsert_profile' | 'upsert_booking';
  error: string;
};
