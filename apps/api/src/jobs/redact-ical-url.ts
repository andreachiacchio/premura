/**
 * Maschera la query string di un URL iCal per renderlo sicuro nei log.
 *
 * Motivazione (security): gli URL iCal di Booking e Airbnb portano nella
 * query string un token di accesso a lunga durata che, se compromesso, da'
 * lettura completa al feed prenotazioni della struttura.
 *  - Booking: https://ical.booking.com/v1/export?t=47e1d765-...
 *  - Airbnb:  https://www.airbnb.com/calendar/ical/12345.ics?s=...
 *
 * Pino in produzione persiste su filesystem e viene tipicamente inoltrato a
 * un aggregator esterno: ogni log con URL completo equivarrebbe a leakare
 * il token. Questa funzione e' l'unico passaggio autorizzato a stampare un
 * URL iCal nei log applicativi.
 *
 * Comportamento:
 *  - URL valido con query string  -> "<origin><pathname>?***REDACTED***"
 *  - URL valido senza query string -> ritornato invariato
 *  - URL malformato / non parsabile -> stringa letterale "(invalid url)"
 *
 * Implementazione basata su URL constructor nativo (no regex) per evitare
 * errori di parsing su edge case di encoding.
 */
export function redactIcalUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '(invalid url)';
  }
  if (parsed.search === '') return url;
  return `${parsed.origin}${parsed.pathname}?***REDACTED***`;
}
