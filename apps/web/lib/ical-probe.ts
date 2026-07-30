// Verifica di un feed iCal incollato dall'host: fetch + conteggio eventi.
// Usata dallo step calendario dell'onboarding e dalla sezione "Calendari"
// della pagina Strutture. Dice cio' che sa — "il feed risponde e contiene
// N eventi" — senza promettere sincronizzazioni che avverranno dopo.

export type IcalProbeResult =
  | { ok: true; eventsFound: number }
  | { ok: false; reason: 'invalid_url' | 'fetch_failed' | 'parse_failed'; detail?: string };

export async function probeIcalUrl(rawUrl: string): Promise<IcalProbeResult> {
  const url = rawUrl.trim();
  if (!url) return { ok: false, reason: 'invalid_url', detail: 'URL vuoto' };
  try {
    new URL(url);
  } catch {
    return { ok: false, reason: 'invalid_url', detail: 'URL malformato' };
  }
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Premura/1.0 iCal probe' },
    });
    if (!res.ok) {
      return { ok: false, reason: 'fetch_failed', detail: `HTTP ${res.status}` };
    }
    const text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) {
      return { ok: false, reason: 'parse_failed', detail: "Non e' un iCal valido" };
    }
    const matches = text.match(/BEGIN:VEVENT/g);
    return { ok: true, eventsFound: matches?.length ?? 0 };
  } catch (err) {
    return {
      ok: false,
      reason: 'fetch_failed',
      detail: err instanceof Error ? err.message : 'Errore rete',
    };
  }
}
