-- 0037 — Prenotazione diretta (05/08).
--
-- Decisione Andrea: la diretta e' il caso MIGLIORE, non un ripiego.
-- E' l'unico caso in cui l'host ha tutto dal primo minuto (nome,
-- telefono, email, lingua, numero ospiti) e in cui non paga
-- commissioni.
--
-- Due aggiunte, entrambe additive e idempotenti.
--
-- 1. platform += 'altro'.
--    Ordine esplicito di Andrea: NON trattare Vrbo/Expedia/Agoda come
--    "diretta". "Diretta" significa che l'host possiede la relazione
--    col cliente e non paga commissioni; etichettare un OTA come
--    diretta distrugge il significato commerciale del campo.
--    Restano separati i due assi:
--      platform    = origine reale (booking | airbnb | direct | altro)
--      data_source = cosa guida il comportamento dell'agente
--
-- 2. bookings.host_notes.
--    Campo libero dell'host sulla prenotazione (allergie, orario di
--    arrivo concordato, accordi presi a voce). NON e' il messaggio
--    dell'ospite: quello vive in guest_message_original.
--
-- Il prezzo NON aggiunge una colonna: per una prenotazione diretta
-- l'incasso dell'host E' il prezzo, quindi si riusa host_payout_amount
-- / host_payout_currency che esistono gia'.

ALTER TYPE "platform" ADD VALUE IF NOT EXISTS 'altro';
--> statement-breakpoint

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "host_notes" text;
