-- Blocchi calendario importati come prenotazioni (bug 30/07).
--
-- L'iCal contiene sia prenotazioni sia blocchi: Airbnb li distingue in
-- SUMMARY ("Reserved" vs "Airbnb (Not available)"), Booking invece
-- esporta OGNI fascia occupata come "CLOSED - Not available" — senza
-- ospite, mai. Il mapper scartava la SUMMARY e importava tutto come
-- prenotazione ("Villa Cristina 31 lug 2027 - 30 gen 2028": 183 notti,
-- un blocco, non un ospite). Risultato: conteggi gonfiati ovunque.
--
-- is_calendar_block = true marca le fasce occupate senza ospite. Le
-- query di prodotto (home, da completare, check-in, conteggi strutture,
-- cron benvenuto) le escludono. In ingresso il mapper ora le filtra.
--
-- Riapplicabile senza danni.

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "is_calendar_block" boolean NOT NULL DEFAULT false;
