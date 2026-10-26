-- 0038 — Cancellazioni: decide Premura, non l'host (26/10).
--
-- Misurato il 26/10 su Villa Cristina: 7 prenotazioni iCal assenti dal
-- feed da 5 a 67 giorni, "possibile cancellazione" in home, nessuna
-- risposta dell'host. Erano cancellazioni vere. La decisione passa al
-- worker; queste due colonne servono a dire perche', e a rispettare
-- l'host quando dice il contrario.
--
-- 1. bookings.cancellation_reason
--    Valorizzata SOLO quando a cancellare e' Premura:
--      'feed_missing_3d' = assente dal feed per 3 giorni di poll riusciti
--      'superseded'      = UID sparito, date coperte da un altro evento
--                          dello stesso feed (stessa prenotazione
--                          rinominata da Booking)
--    NULL su una riga 'cancelled' = l'ha cancellata l'host o un'email.
--
-- 2. bookings.host_kept_active_at
--    L'host ha cliccato "Era ancora attiva". Da quel momento la
--    riconciliazione non tocca piu' la riga: senza questo segno, tre
--    giorni dopo Premura la ricancellerebbe da sola.
--
-- Additiva e idempotente: il codice gia' in produzione non legge
-- nessuna delle due colonne.

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "cancellation_reason" varchar(32);
--> statement-breakpoint

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "host_kept_active_at" timestamp with time zone;
