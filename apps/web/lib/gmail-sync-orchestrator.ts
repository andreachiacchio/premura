import type { ServerClient } from '@premura/db';
import { getTokenByHostAndEmail } from './repositories/google-tokens';
import {
  createGmailClient,
  searchAirbnbEmails,
  fetchEmailContent,
  GmailClientError,
  type GmailClient,
} from './gmail-client';
import { parseAirbnbEmail, AirbnbParserError, type ParsedAirbnbEmail } from './airbnb-email-parser';
import { matchProperty } from './property-matcher';
import { upsertGuestProfile } from './repositories/guest-profiles';
import { upsertBookingFromEmail, cancelBooking } from './repositories/bookings';
import {
  createJob,
  setTotalEmails,
  incrementJob,
  appendErrorLog,
  completeJob,
  type SyncIncrement,
} from './repositories/gmail-sync-jobs';

// Orchestrator del sync Gmail (M2a.3 Fase 2).
//
// Flow:
//   1. createJob → status='running', restituisce jobId.
//   2. Recupera google_token attivo del host (errore terminale se assente).
//   3. searchAirbnbEmails ultimi 90gg.
//   4. setTotalEmails(N) — il frontend può ora mostrare progress.
//   5. Loop su ogni messageId:
//        a. fetchEmailContent
//        b. parseAirbnbEmail (Claude Sonnet 4.6)
//        c. classify by email_type:
//           - other / pre_approval → skip_not_confirmation +1
//           - cancellation → cancelBooking (matchProperty + lookup)
//           - confirmation → check check-in futuro? upsert profile +
//             upsert booking
//           - modification → upsert booking come confirmation (i nuovi
//             dati vincono); per ora trattata come confirmation senza
//             distinguere
//        d. incrementJob(processed +1, e altri counter)
//        e. catch: appendErrorLog, NON blocca le altre email
//   6. completeJob(status='completed').

export type SyncOptions = {
  daysBack?: number;
  // Override "now" per test (deterministic dates).
  now?: Date;
  // Override del client Gmail per test integration (mock googleapis).
  gmailClientFactory?: (
    serverClient: ServerClient,
    hostId: string,
    googleEmail: string,
  ) => Promise<GmailClient>;
  // Override parser per test (skip Claude API).
  emailParser?: (input: Parameters<typeof parseAirbnbEmail>[0]) => Promise<ParsedAirbnbEmail>;
  // Riusa un jobId già creato dal caller (pattern API route: il route
  // handler crea il job up-front per restituire l'id al client, poi
  // lascia all'orchestrator il completamento in background).
  reuseJobId?: string;
};

export type SyncResult = {
  jobId: string;
  status: 'completed' | 'failed';
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
  truncated: boolean;
  fatalError?: string;
};

// Hard cap di sicurezza: protezione costi vs host con casella molto attiva
// o sync runaway. Se la query Gmail trova più email di questo limite,
// processiamo solo le N più recenti e marchiamo job.truncated=true.
// L'host può rilanciare il sync per processare le rimanenti.
export const MAX_EMAILS_PER_SYNC = 200;

export async function syncGmailForHost(
  serverClient: ServerClient,
  hostId: string,
  googleEmail: string,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const daysBack = options.daysBack ?? 90;
  const now = options.now ?? new Date();
  const todayUtcMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const { db } = serverClient;

  // Step 1: crea job (o riusa quello passato dal caller).
  const job = options.reuseJobId
    ? { id: options.reuseJobId }
    : await createJob(db, hostId, googleEmail);

  // Conteggi locali (denormalizzati per il return finale).
  const stats = {
    processedEmails: 0,
    enrichedCount: 0,
    createdCount: 0,
    skippedPast: 0,
    skippedNoMatch: 0,
    skippedNotConfirmation: 0,
    cancelledCount: 0,
    guestProfilesCreated: 0,
    guestProfilesUpdated: 0,
  };

  let totalEmails = 0;
  let truncated = false;
  let fatalError: string | undefined;

  try {
    // Step 2: verifica token presente (fail-fast).
    const token = await getTokenByHostAndEmail(db, hostId, googleEmail);
    if (!token) {
      throw new Error(
        `Nessun google_token per host=${hostId} email=${googleEmail}. Ricollegare Gmail.`,
      );
    }

    // Step 3: instanzia Gmail client (auto-refresh access_token via refresh_token).
    const factory = options.gmailClientFactory ?? createGmailClient;
    const gmail = await factory(serverClient, hostId, googleEmail);

    // Step 4: query email Airbnb ultimi N giorni.
    const allMessageIds = await searchAirbnbEmails(gmail, daysBack, { now });
    // Hard cap: se >200 email, processa solo le 200 PIÙ RECENTI. Gmail
    // API ritorna gli ID in ordine cronologico inverso (più recente prima),
    // quindi slice(0, MAX) prende esattamente quelle.
    const messageIds = allMessageIds.slice(0, MAX_EMAILS_PER_SYNC);
    truncated = allMessageIds.length > MAX_EMAILS_PER_SYNC;
    totalEmails = messageIds.length;
    await setTotalEmails(db, job.id, totalEmails, truncated);
    if (truncated) {
      // Nota informativa nel log: NON è un errore di una specifica email.
      await appendErrorLog(db, job.id, {
        messageId: '_sync_truncated',
        stage: 'fetch',
        error: `${allMessageIds.length} email Airbnb trovate negli ultimi ${daysBack}gg, processate solo le ${MAX_EMAILS_PER_SYNC} più recenti per protezione costi. Re-run sync per le rimanenti.`,
      });
    }

    // Step 5: loop processing.
    const parser = options.emailParser ?? parseAirbnbEmail;
    for (const messageId of messageIds) {
      const inc: SyncIncrement = { processedEmails: 1 };
      try {
        const email = await fetchEmailContent(gmail, messageId);
        const parsed = await parser({
          htmlBody: email.htmlBody,
          textBody: email.textBody,
          date: email.date,
          subject: email.subject,
        });

        // Classifica.
        if (parsed.email_type === 'other' || parsed.email_type === 'pre_approval') {
          inc.skippedNotConfirmation = 1;
          stats.skippedNotConfirmation++;
        } else if (parsed.email_type === 'cancellation') {
          // Cerca property per cancelBooking. Se non c'è property o code, skip.
          if (!parsed.property_name || !parsed.booking_external_code) {
            inc.skippedNoMatch = 1;
            stats.skippedNoMatch++;
          } else {
            const match = await matchProperty(db, hostId, parsed.property_name);
            if (!match) {
              inc.skippedNoMatch = 1;
              stats.skippedNoMatch++;
            } else {
              const cancelled = await cancelBooking({
                db,
                propertyId: match.propertyId,
                bookingExternalCode: parsed.booking_external_code,
              });
              if (cancelled && !cancelled.alreadyCancelled) {
                inc.cancelledCount = 1;
                stats.cancelledCount++;
              }
            }
          }
        } else {
          // confirmation o modification → upsert booking.
          // Modification col parser corrente potrebbe avere campi nullable;
          // skipp se mancano dati essenziali.
          const isFullConfirm = parsed.email_type === 'confirmation';
          if (!isFullConfirm) {
            // modification → richiede campi completi per essere processata
            // come confirmation. Se incompleti, skip.
            if (
              !parsed.guest_full_name ||
              !parsed.check_in_date ||
              !parsed.check_out_date ||
              !parsed.nights ||
              !parsed.guest_count ||
              !parsed.booking_external_code
            ) {
              inc.skippedNotConfirmation = 1;
              stats.skippedNotConfirmation++;
              await persistInc(db, job.id, inc);
              continue;
            }
          }

          // Filtro check-in futuro.
          if (parsed.email_type === 'confirmation') {
            const checkin = new Date(parsed.check_in_date + 'T00:00:00Z');
            if (checkin < todayUtcMidnight) {
              inc.skippedPast = 1;
              stats.skippedPast++;
              await persistInc(db, job.id, inc);
              continue;
            }
          }

          // Match property.
          if (!parsed.property_name) {
            inc.skippedNoMatch = 1;
            stats.skippedNoMatch++;
            await persistInc(db, job.id, inc);
            continue;
          }
          const match = await matchProperty(db, hostId, parsed.property_name);
          if (!match) {
            inc.skippedNoMatch = 1;
            stats.skippedNoMatch++;
            await persistInc(db, job.id, inc);
            continue;
          }

          // Costruisci ParsedAirbnbConfirmation dal modification (con cast
          // sicuro perché abbiamo verificato i campi sopra).
          const confirmationLike =
            parsed.email_type === 'confirmation'
              ? parsed
              : ({
                  email_type: 'confirmation' as const,
                  guest_full_name: parsed.guest_full_name!,
                  guest_first_name: parsed.guest_first_name ?? parsed.guest_full_name!.split(' ')[0]!,
                  guest_country_code: null,
                  guest_language: null,
                  guest_count: parsed.guest_count!,
                  guest_message_original: null,
                  guest_message_lang: null,
                  host_payout_amount: null,
                  host_payout_currency: null,
                  check_in_date: parsed.check_in_date!,
                  check_out_date: parsed.check_out_date!,
                  nights: parsed.nights!,
                  booking_external_code: parsed.booking_external_code!,
                  property_name: parsed.property_name,
                  airbnb_listing_url: parsed.airbnb_listing_url,
                });

          // Upsert guest_profile.
          const profile = await upsertGuestProfile(db, hostId, confirmationLike);
          if (profile.created) {
            inc.guestProfilesCreated = 1;
            stats.guestProfilesCreated++;
          } else {
            inc.guestProfilesUpdated = 1;
            stats.guestProfilesUpdated++;
          }

          // Upsert booking.
          const result = await upsertBookingFromEmail({
            db,
            propertyId: match.propertyId,
            guestProfileId: profile.profileId,
            rawEmailId: messageId,
            parsed: confirmationLike,
          });
          if ('upserted' in result) {
            if (result.created) {
              inc.createdCount = 1;
              stats.createdCount++;
            } else if (result.enriched) {
              inc.enrichedCount = 1;
              stats.enrichedCount++;
            }
          }
          // Se 'skipped' (already_synced), niente da incrementare.
        }

        stats.processedEmails++;
        await persistInc(db, job.id, inc);
      } catch (err) {
        // Errore singola email NON blocca le altre.
        const stage = inferStage(err);
        const errMsg = err instanceof Error ? err.message : String(err);
        await appendErrorLog(db, job.id, { messageId, stage, error: errMsg });
        // Conta come processed per la progress bar.
        stats.processedEmails++;
        await persistInc(db, job.id, { processedEmails: 1 });
      }
    }
  } catch (err) {
    fatalError = err instanceof Error ? err.message : String(err);
  }

  await completeJob(db, job.id, fatalError ? 'failed' : 'completed', fatalError);

  return {
    jobId: job.id,
    status: fatalError ? 'failed' : 'completed',
    totalEmails,
    truncated,
    fatalError,
    ...stats,
  };
}

async function persistInc(
  db: ServerClient['db'],
  jobId: string,
  inc: SyncIncrement,
): Promise<void> {
  if (Object.keys(inc).length === 0) return;
  await incrementJob(db, jobId, inc);
}

function inferStage(err: unknown): 'fetch' | 'parse' | 'match' | 'upsert_profile' | 'upsert_booking' {
  if (err instanceof GmailClientError) return 'fetch';
  if (err instanceof AirbnbParserError) return 'parse';
  // Default: errori DB nel finale del flow → upsert_booking è il caso più
  // probabile dopo il parse (l'ordine è profile → booking).
  return 'upsert_booking';
}
