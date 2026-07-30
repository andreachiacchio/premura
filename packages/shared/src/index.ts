// Niente estensione .js sui sub-import: il monorepo Premura consuma i
// pacchetti workspace as-source (vedi packages/shared/package.json
// "main": "./src/index.ts" e apps/api/Dockerfile riga 4-9 — strategia
// "ZERO compile step" via tsx a runtime). Webpack di Next 15 risolve
// './foo' -> './foo.ts' ma fallisce su './foo.js' quando il file e' .ts;
// tsx e tsc bundler tollerano entrambe le forme, quindi senza .js siamo
// compatibili con tutti i runtime del repo.
export * from './claude';
export * from './booking-data-richness';
export * from './ai-disclosure';
export * from './outbound-guard';
export * from './contact-guard';

// ATTENZIONE — non esportare qui i moduli che importano built-in Node.
//
// Questo barrel finisce nel bundle browser: apps/web/lib/types.ts lo
// importa, ed e' a sua volta importato da client component come
// dashboard/_components/BookingRow.tsx. Un `node:crypto` raggiunto per
// questa catena fa fallire il build di Next con UnhandledSchemeError,
// anche se la funzione non viene mai chiamata lato client.
//
// I moduli server-only si importano dal loro percorso diretto:
//   import { fingerprintIp } from '@premura/shared/src/consent-ip';
//
// Riguarda oggi: ./consent-ip (node:crypto).
