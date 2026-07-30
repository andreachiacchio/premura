-- REGOLA DI BUSINESS (Andrea, 30/07): i contatti dei fornitori non
-- escono MAI verso l'ospite. Se l'ospite ottiene il numero, scavalca
-- Premura e prenota diretto: perdiamo margine e controllo.
--
--  - contact_visibility: 'internal' di default su OGNI provider. La
--    guardia in reserveAndSend blocca qualunque messaggio in uscita
--    che contenga il numero di un provider internal. Due categorie:
--    contatti host-side (Paolo, Grazia — in property_knowledge)
--    condivisibili; contatti fornitori (providers) mai.
--  - public_label: come nominare il fornitore davanti all'ospite —
--    il ruolo, mai il nome ("il nostro skipper", non "Antonio").
--
-- Riapplicabile senza danni: ADD COLUMN IF NOT EXISTS.

ALTER TABLE "providers"
  ADD COLUMN IF NOT EXISTS "contact_visibility" varchar(16) NOT NULL DEFAULT 'internal';
--> statement-breakpoint

ALTER TABLE "providers"
  ADD COLUMN IF NOT EXISTS "public_label" varchar(80);
