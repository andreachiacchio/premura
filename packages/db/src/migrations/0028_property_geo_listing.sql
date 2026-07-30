-- Colonne per il wizard "Aggiungi struttura" e per la tracciabilita'
-- degli annunci (segnalazioni Andrea 30/07).
--
--  - latitude/longitude: coordinate dall'indirizzo CONFERMATO dall'host
--    (geocoding Nominatim/OSM lato server). Base per mappa e POI della
--    guest app. Nullable: mai geocodificare un indirizzo non confermato.
--  - booking_listing_id: codice annuncio Booking.com (es. "10194397").
--    I token iCal sono opachi e non documentano a quale annuncio
--    puntano: la corrispondenza property ↔ annuncio va tenuta qui,
--    compilata solo dopo verifica. Contesto: due property di Napoli con
--    nomi da confermare — il codice evita futuri scambi di casa.
--
-- Riapplicabile senza danni: ADD COLUMN IF NOT EXISTS.

ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "latitude" numeric(9, 6);
--> statement-breakpoint

ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "longitude" numeric(9, 6);
--> statement-breakpoint

ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "booking_listing_id" varchar(32);
