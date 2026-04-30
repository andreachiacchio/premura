-- Onboarding incrementale: l'host crea la property con nome, citta'
-- e iCal Booking URL. L'indirizzo completo viene aggiunto dopo via
-- settings page (slice futuro). Stringa vuota in NOT NULL e' anti-pattern:
-- il vincolo diventa una menzogna a runtime, query analitiche devono
-- filtrare != '' invece di IS NOT NULL, complica logica futura di
-- indirizzo verificato. Nullable e' semanticamente corretto.

ALTER TABLE "properties" ALTER COLUMN "address_line" DROP NOT NULL;
