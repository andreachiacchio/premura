import type { VEvent } from 'node-ical';
import pino from 'pino';

/**
 * Logger dedicato al mapper. Pino e non console per allineamento con il
 * resto del pipeline iCal (worker, scheduler) — rende ricercabile per name
 * negli aggregator log.
 *
 * La funzione mapIcalEventToBookingShell e' altrimenti pura: l'unica
 * side-channel autorizzata e' un warn quando un VEVENT e' malformato. Si
 * sceglie di skippare con warn invece di throw per non far crashare il job
 * per un singolo evento corrotto in un feed altrimenti valido.
 */
const logger = pino({
  name: 'ical-event-mapper',
  level: process.env.LOG_LEVEL ?? 'info',
});

const MS_PER_DAY = 86_400_000;

/**
 * Booking "shell" — il sottoinsieme minimo di dati ricavabili da un VEVENT
 * iCal. Non contiene PII reale (guest_full_name e' un placeholder).
 *
 * L'arricchimento con dati ospite veri arriva da fonti separate:
 *  - Airbnb: parser email Airbnb (M2a.3 Fase 2) -> data_source diventa 'airbnb_email_parsed' (RICH)
 *  - Booking: form manuale host (M2a.4)        -> data_source diventa 'booking_manual_filled' (RICH)
 */
export type IcalBookingShell = {
  propertyId: string;
  platform: 'booking' | 'airbnb';
  /** UID iCal, es. "a90207a6098fea365fa0d9ebc4af632d@booking.com". */
  platformBookingRef: string;
  /** iCal Booking/Airbnb non espongono il codice prenotazione user-facing. */
  bookingExternalCode: null;
  guestFullName: string;
  numGuests: number;
  numAdults: number;
  numChildren: number;
  checkinAt: Date;
  checkoutAt: Date;
  nights: number;
  status: 'confirmed';
  dataSource: 'booking_ical_only' | 'airbnb_ical_only';
};

/**
 * Converte un VEVENT node-ical in IcalBookingShell pronta per upsert.
 *
 * Comportamento:
 *  - event.type !== 'VEVENT'                 -> return null (skip silente)
 *  - event.uid o event.start o event.end mancanti -> return null + warn
 *  - altrimenti torna shell completa
 *
 * Convenzioni:
 *  - guestFullName placeholder:
 *      'booking' -> 'Booking Guest'
 *      'airbnb'  -> 'Reserved' (allineato a quanto Airbnb scrive in SUMMARY iCal)
 *  - dataSource:
 *      'booking' -> 'booking_ical_only' (INCOMPLETE, triggera form manuale M2a.4)
 *      'airbnb'  -> 'airbnb_ical_only'  (NON triggera form M2a.4: per Airbnb
 *                                        il completamento dati ospite arriva
 *                                        automatico via email parser Fase 2)
 *  - num_guests/adults/children: default 1/1/0 (iCal non li espone). Il count
 *    reale arriva con l'arricchimento email/manuale.
 *  - nights: differenza in giorni tra checkout e checkin, arrotondata. Math.round
 *    per assorbire artefatti DST quando le date sono datetime con TZ.
 */
/**
 * Tre categorie (decisione Andrea 30/07), perche' Booking non
 * distingue: esporta OGNI fascia occupata come "CLOSED - Not
 * available", prenotazioni vere incluse.
 *
 *  - BLOCCO CERTO -> scartato: Airbnb "(Not available)" (Airbnb
 *    dichiara i blocchi), e Booking sopra le 30 notti (nessun
 *    soggiorno breve dura tanto — es. "31 lug 2027 - 30 gen 2028").
 *  - OCCUPATO, SORGENTE IGNOTA -> importato: Booking sotto le 30
 *    notti. Probabile ospite vero; la UI lo mostra con etichetta
 *    propria ("date occupate — verifica sull'extranet"), mai nascosto.
 *  - PRENOTAZIONE -> importato: Airbnb "Reserved" e tutto il resto.
 */
const BLOCK_SUMMARY = /not available|unavailable|closed|blocked/i;
const MAX_UNKNOWN_OCCUPIED_NIGHTS = 30;

export function isCalendarBlockSummary(summary: unknown): boolean {
  return typeof summary === 'string' && BLOCK_SUMMARY.test(summary);
}

export function mapIcalEventToBookingShell(
  event: VEvent,
  propertyId: string,
  source: 'booking' | 'airbnb',
): IcalBookingShell | null {
  if (event.type !== 'VEVENT') return null;

  if (!event.uid || !event.start || !event.end) {
    logger.warn(
      {
        propertyId,
        source,
        uid: event.uid ?? null,
        hasStart: Boolean(event.start),
        hasEnd: Boolean(event.end),
      },
      'skipping malformed VEVENT (missing uid/start/end)',
    );
    return null;
  }

  const checkinAt = event.start instanceof Date ? event.start : new Date(event.start);
  const checkoutAt = event.end instanceof Date ? event.end : new Date(event.end);
  const nights = Math.round((checkoutAt.getTime() - checkinAt.getTime()) / MS_PER_DAY);

  if (isCalendarBlockSummary(event.summary)) {
    const certainBlock = source === 'airbnb' || nights > MAX_UNKNOWN_OCCUPIED_NIGHTS;
    if (certainBlock) {
      logger.debug(
        { propertyId, source, uid: event.uid, nights, summary: event.summary },
        'skipping calendar block (not a booking)',
      );
      return null;
    }
    // Booking <= 30 notti: occupato, sorgente ignota — si importa.
  }

  return {
    propertyId,
    platform: source,
    platformBookingRef: event.uid,
    bookingExternalCode: null,
    guestFullName: source === 'booking' ? 'Booking Guest' : 'Reserved',
    numGuests: 1,
    numAdults: 1,
    numChildren: 0,
    checkinAt,
    checkoutAt,
    nights,
    status: 'confirmed',
    dataSource: source === 'booking' ? 'booking_ical_only' : 'airbnb_ical_only',
  };
}
