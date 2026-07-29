// Niente estensione .js: Next.js webpack non risolve .js su file .ts
// (vs tsx runtime + tsc bundler che lo fanno). Stesso fix di
// packages/agents/src/index.ts (slice 8.4 hotfix).
export * from './stripe';

// ─── WhatsApp ───────────────────────────────────────────────────────
//
// sendText e sendImage arrivano dal TRANSPORT, non da whatsapp-business.
// I chiamanti esistenti (`import { sendText } from '@premura/integrations'`)
// passano quindi dal punto di strozzatura senza modifiche al loro codice.
//
// whatsapp-business.ts e whatsapp-waha.ts NON sono riesportati per intero:
// esporre le loro sendText/sendImage lascerebbe aperta una porta laterale
// verso Meta o WAHA, ed e' esattamente cio' che il transport esiste per
// impedire. Da loro riesportiamo solo i parser dei webhook, i tipi di
// errore e le utility — roba che non invia niente.
export * from './whatsapp-transport';

export {
  WhatsappSendError,
  downloadMedia,
  parseInboundWebhook,
  parseStatusEvents,
  sendTemplate,
  type InboundMessage,
  type WhatsappStatusEvent,
} from './whatsapp-business';

export {
  WahaSendError,
  chatIdToPhone,
  checkNumberOnWhatsapp,
  parseWahaWebhook,
  toChatId,
  type WahaInboundMessage,
} from './whatsapp-waha';
