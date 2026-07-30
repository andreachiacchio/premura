-- Colore fisso per struttura (30/07): riconoscere la struttura senza
-- leggere. Campo hex (#RRGGBB), assegnato automaticamente alla
-- creazione da una palette definita; applicato ovunque compaia una
-- struttura (bordo riga, chip, avatar, intestazioni).
ALTER TABLE "properties" ADD COLUMN "color" varchar(7);
