// Helper applicativo per classificare bookings.data_source in RICH vs INCOMPLETE.
// Volutamente fuori dal DB (niente Postgres enum) per lasciare flessibilita
// di evoluzione futura senza migration.
//
// Vedi docs/m2a4-spec.md sezione 2.4.

const RICH_DATA_SOURCES = [
  'airbnb_email_parsed',
  'booking_manual_filled',
  'booking_via_channel_manager',
] as const;

const INCOMPLETE_DATA_SOURCES = ['booking_ical_only', 'booking_email_only'] as const;

/**
 * Ritorna true quando la prenotazione ha dati ospite sufficienti ad attivare
 * il workflow agente AI completo (Guest DNA, messaggi pre-arrivo, kit
 * composer): nome ospite, contatto, lingua presunta.
 *
 * Usato dal workflow on-new-booking per decidere se procedere o restare
 * silente in attesa di completamento manuale.
 *
 * Vedi docs/m2a4-spec.md sezione 2.4.
 */
export function isRichDataSource(dataSource: string): boolean {
  return (RICH_DATA_SOURCES as readonly string[]).includes(dataSource);
}

/**
 * Ritorna true quando la prenotazione e arrivata da una fonte data-poor
 * (iCal Booking o email Booking event ingestor) e quindi non ha dati
 * sufficienti al workflow agente AI: l'host puo completarli a mano via
 * form M2a.4 oppure saltare.
 *
 * Vedi docs/m2a4-spec.md sezione 2.4.
 */
export function isIncompleteDataSource(dataSource: string): boolean {
  return (INCOMPLETE_DATA_SOURCES as readonly string[]).includes(dataSource);
}
