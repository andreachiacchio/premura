-- 0039 — Quando Premura ha cancellato una prenotazione (26/10).
--
-- La home dice quante prenotazioni Premura ha tolto "negli ultimi 30
-- giorni". Decisione Andrea: la finestra si conta dal momento in cui
-- cancella Premura, non da quello in cui il feed ha tolto la riga
-- (possible_cancellation_at, che resta e si mostra per riga). Senza
-- questa colonna, le prenotazioni tolte dal feed ad agosto e cancellate
-- oggi sparivano dalla home senza traccia.
--
-- Valorizzata solo dalla riconciliazione (regole A e B), azzerata quando
-- la riga torna confirmed (UID ricomparso, oppure "Era ancora attiva").
--
-- Backfill: le righe gia' cancellate da Premura prima di questa colonna.
-- La riconciliazione scrive updated_at nello stesso UPDATE che cancella,
-- e nessun altro percorso tocca una riga cancellata da Premura.
--
-- APPLICARE PRIMA DEL MERGE: Drizzle mette ogni colonna dello schema in
-- ogni INSERT su bookings, quindi codice nuovo su schema vecchio fa
-- fallire tutti gli insert (lezione della 0038).

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "auto_cancelled_at" timestamp with time zone;
--> statement-breakpoint

UPDATE "bookings"
SET "auto_cancelled_at" = "updated_at"
WHERE "status" = 'cancelled'
  AND "cancellation_reason" IS NOT NULL
  AND "auto_cancelled_at" IS NULL;
