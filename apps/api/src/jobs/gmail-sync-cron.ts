import { Cron } from 'croner';
import pino from 'pino';

// Sync Gmail schedulato (decisione Andrea 30/07): il parser email
// Airbnb esiste e funziona, ma non era MAI stato schedulato — girava
// solo su chiamata manuale della route (6 esecuzioni, tutte il 27
// aprile). Da qui: ogni 15 minuti come l'iCal.
//
// Il codice del parser vive in apps/web (orchestrator + ingestor), non
// importabile dal worker: il cron chiama la route su Vercel col secret
// macchina GMAIL_SYNC_CRON_SECRET (stesso valore nelle env Vercel e
// nelle secrets Fly). La route fa partire il sync per tutti gli host
// con Gmail collegato e risponde subito coi jobId; l'esito vero sta in
// gmail_sync_jobs.
//
// Senza secret o URL configurati il tick logga e esce: mai bloccare il
// worker per una feature opzionale.

const logger = pino({
  name: 'gmail-sync-cron',
  level: process.env.LOG_LEVEL ?? 'info',
});

export async function runGmailSyncTick(): Promise<void> {
  const secret = process.env.GMAIL_SYNC_CRON_SECRET?.trim();
  const base = (process.env.GMAIL_SYNC_URL ?? 'https://premura.it').replace(/\/$/, '');
  if (!secret) {
    logger.warn('GMAIL_SYNC_CRON_SECRET non configurato: sync Gmail saltato');
    return;
  }
  try {
    const res = await fetch(`${base}/api/gmail/sync`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.text();
    if (res.status === 202) {
      logger.info({ body }, 'gmail sync avviato');
    } else {
      logger.error({ status: res.status, body: body.slice(0, 300) }, 'gmail sync rifiutato');
    }
  } catch (err) {
    logger.error({ err }, 'gmail sync tick failed');
  }
}

export function startGmailSyncCron(): Cron {
  return new Cron('*/15 * * * *', () => runGmailSyncTick());
}
