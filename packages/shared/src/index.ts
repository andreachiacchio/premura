// Niente estensione .js sui sub-import: il monorepo Premura consuma i
// pacchetti workspace as-source (vedi packages/shared/package.json
// "main": "./src/index.ts" e apps/api/Dockerfile riga 4-9 — strategia
// "ZERO compile step" via tsx a runtime). Webpack di Next 15 risolve
// './foo' -> './foo.ts' ma fallisce su './foo.js' quando il file e' .ts;
// tsx e tsc bundler tollerano entrambe le forme, quindi senza .js siamo
// compatibili con tutti i runtime del repo.
export * from './claude';
export * from './booking-data-richness';
