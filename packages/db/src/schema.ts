// Schema Drizzle v2 — barrel di tutte le tabelle, enum e relations.
//
// Struttura: file singoli per tabella in ./schema/, aggregati qui.
// Vedi docs/architecture.md §4 (v2) e §9 (v1) per la fonte di verità.
//
// Convenzioni:
//  - commenti in italiano
//  - enum pgEnum esplicite (in ./schema/enums.ts)
//  - FK con cascade policy esplicita
//  - indici su host_id, booking_id, status, created_at dove filtrati
//  - RLS NON qui (fase 1.2.d via SQL separato)

export * from './schema/enums';
export * from './schema/hosts';
export * from './schema/host-voice-profiles';
export * from './schema/autopilot-rules';
export * from './schema/properties';
export * from './schema/property-knowledge-base';
export * from './schema/cleaners';
export * from './schema/bookings';
export * from './schema/guest-profiles';
export * from './schema/guest-quizzes';
export * from './schema/kits';
export * from './schema/conversations';
export * from './schema/messages';
export * from './schema/pending-drafts';
export * from './schema/agent-actions';
export * from './schema/pending-payouts';
export * from './schema/reviews';
export * from './schema/local-partners';
export * from './schema/relations';
