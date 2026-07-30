import { type Database, type IcalSource, properties } from '@premura/db';
import { eq } from 'drizzle-orm';

// Stato di sincronizzazione per feed, dentro il jsonb ical_sources.
// Il poll worker registra qui l'esito di OGNI giro: e' cio' che
// trasforma "configurato" (una speranza) in uno stato vero, e che
// permette alla home di alzare una decisione quando un feed muore
// in silenzio come i due di La Goccia.

export type FeedOutcome = { ok: true; eventsCount: number } | { ok: false; error: string };

/** Applica l'esito di un poll alla entry corrispondente (per URL). Pura. */
export function applyFeedOutcome(
  sources: IcalSource[],
  url: string,
  outcome: FeedOutcome,
  now: Date,
): IcalSource[] {
  const nowIso = now.toISOString();
  return sources.map((src) => {
    if (src.url !== url) return src;
    if (outcome.ok) {
      return {
        ...src,
        lastCheckedAt: nowIso,
        lastOkAt: nowIso,
        lastResult: 'ok' as const,
        lastError: undefined,
        consecutiveFailures: 0,
        lastEventsCount: outcome.eventsCount,
      };
    }
    return {
      ...src,
      lastCheckedAt: nowIso,
      lastResult: 'error' as const,
      lastError: outcome.error.slice(0, 300),
      consecutiveFailures: (src.consecutiveFailures ?? 0) + 1,
    };
  });
}

/** Legge, applica e riscrive. Best-effort: un errore qui non deve far fallire il poll. */
export async function recordFeedOutcome(
  db: Database,
  propertyId: string,
  url: string,
  outcome: FeedOutcome,
  now: Date = new Date(),
): Promise<void> {
  const [row] = await db
    .select({ icalSources: properties.icalSources })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!row) return;
  await db
    .update(properties)
    .set({ icalSources: applyFeedOutcome(row.icalSources, url, outcome, now) })
    .where(eq(properties.id, propertyId));
}
