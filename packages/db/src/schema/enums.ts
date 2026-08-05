import { pgEnum } from 'drizzle-orm/pg-core';

// Tutti gli enum pgEnum del progetto sono centralizzati qui:
// i nomi sono unici a livello di database Postgres, quindi
// raccogliere tutto in un unico file previene collisioni.

// ─────────────────────────────────────────────────────────────
// BOOKINGS / PROPERTIES
// ─────────────────────────────────────────────────────────────

// Piattaforma origine di una prenotazione
// 'direct' = l'host possiede la relazione col cliente e non paga
// commissioni. 'altro' = ogni altro canale (Vrbo, Expedia, Agoda...):
// tenuto separato di proposito, perche' chiamarlo "diretta"
// distruggerebbe il significato commerciale del campo (migration 0037).
export const platformEnum = pgEnum('platform', ['booking', 'airbnb', 'direct', 'altro']);

// Ciclo di vita di una prenotazione
export const bookingStatusEnum = pgEnum('booking_status', [
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
]);

// Tipo di evento intercettato da un'email Booking.com (M2a.3 Fase 3).
// Le email Booking sono usate solo come trigger di evento (subject parsing
// deterministico via regex, no AI). Vedi apps/web/lib/booking-email-classifier.ts.
export const bookingEmailEventTypeEnum = pgEnum('booking_email_event_type', [
  'new_booking',
  'cancellation',
  'modification',
  'noise',
]);

// ─────────────────────────────────────────────────────────────
// KIT
// ─────────────────────────────────────────────────────────────

export const kitStatusEnum = pgEnum('kit_status', [
  // ─── Legacy (milestone 4.x kit composer V1) ───
  'pending_dna',
  'pending_quiz',
  'composing',
  'awaiting_approval',
  'ordered',
  'delivered_to_cleaner',
  'placed_in_property',
  'confirmed_by_guest',
  'failed',
  // ─── Slice C (Concierge Operator V1 — founder manuale) ───
  // Flow: pending_survey -> proposed -> approved/rejected/modified
  // -> ordering -> ordered -> in_transit -> arrived_at_locker
  // -> picked_up_by_cleaner -> set_up -> delivered_to_guest
  'pending_survey',
  'proposed',
  'approved',
  'rejected',
  'modified',
  'ordering',
  'in_transit',
  'arrived_at_locker',
  'picked_up_by_cleaner',
  'set_up',
  'delivered_to_guest',
]);

// ─────────────────────────────────────────────────────────────
// GUEST DNA
// ─────────────────────────────────────────────────────────────

// Livello di rischio di un rischio ospite previsto dall'agente
export const riskLevelEnum = pgEnum('risk_level', ['low', 'medium', 'high']);

// ─────────────────────────────────────────────────────────────
// MESSAGES / CONVERSATIONS
// ─────────────────────────────────────────────────────────────

// Canale usato per un messaggio (superset comprensivo di SMS fallback)
export const messageChannelEnum = pgEnum('message_channel', [
  'whatsapp',
  'booking_inbox',
  'airbnb_inbox',
  'email',
  'sms',
]);

// Sottoinsieme valido per le conversazioni inbound (no SMS)
export const conversationChannelEnum = pgEnum('conversation_channel', [
  'whatsapp',
  'booking_inbox',
  'airbnb_inbox',
  'email',
]);

// Direzione del messaggio rispetto al sistema
export const messageDirectionEnum = pgEnum('message_direction', ['inbound', 'outbound']);

// Entità mittente/destinatario di un messaggio
export const messageEntityEnum = pgEnum('message_entity', ['premura', 'host', 'cleaner', 'guest']);

// Stage di un messaggio outbound programmato (5 fasi + cleaner/host alert)
export const messageStageEnum = pgEnum('message_stage', [
  'pre_arrival_welcome', // Fase 2 — T-48h contatto
  'pre_arrival_quiz', // Fase 2 — quiz 60s
  'kit_reveal', // Fase 3 — mattina check-in con foto kit
  'mid_stay_checkin', // Fase 4 — giorno 2 sera
  'post_stay_survey', // Fase 5 — T+24h sondaggio privato
  'post_stay_recovery', // Fase 5 — recovery feedback negativo
  'post_stay_review_nudge', // Fase 5 — nudge recensione pubblica
  'cleaner_brief', // briefing cleaner
  'host_alert', // alert escalate all'host
  'conversation_reply', // risposta ad inbound (non programmato)
  'other',
]);

// Modalità di decisione dell'agente (matrice delega)
// Coincide con autopilotModeEnum ma aggiunge 'not_applicable'
// per messaggi outbound programmati dove la delega non entra in gioco.
export const decisionModeEnum = pgEnum('decision_mode', [
  'auto',
  'draft',
  'escalate',
  'not_applicable',
]);

// Stato di una conversazione
export const conversationStatusEnum = pgEnum('conversation_status', ['active', 'closed']);

// Stato di un draft in attesa di approvazione host
export const pendingDraftStatusEnum = pgEnum('pending_draft_status', [
  'pending',
  'approved',
  'rejected',
  'modified',
  'expired',
  // Slice 7B: stati post-approvazione per tracking Meta Cloud API.
  'sent', // Meta ha accettato il messaggio (200 + wamid)
  'failed', // Meta ha rejected o retry esauriti
]);

// ─────────────────────────────────────────────────────────────
// AUTOPILOT (MATRICE DELEGA)
// ─────────────────────────────────────────────────────────────

// Tipi di richiesta ospite classificabili dalla matrice delega
export const autopilotRequestTypeEnum = pgEnum('autopilot_request_type', [
  'info_wifi',
  'info_parking',
  'info_checkin',
  'info_neighborhood',
  'early_checkin_short', // ≤ 1h
  'early_checkin_long', // > 1h
  'late_checkout_short', // ≤ 1h
  'late_checkout_long', // > 1h
  'discount_request',
  'extra_services',
  'complaint_item_broken',
  'complaint_serious',
  'emergency',
  'small_talk',
  'tourist_info',
]);

// Modalità autopilot per ciascun tipo di richiesta
export const autopilotModeEnum = pgEnum('autopilot_mode', ['auto', 'draft', 'escalate']);

// ─────────────────────────────────────────────────────────────
// VOICE PROFILE HOST
// ─────────────────────────────────────────────────────────────

// Formalità del tono host
export const voiceFormalityEnum = pgEnum('voice_formality', ['tu', 'lei', 'misto']);

// Frequenza uso emoji
export const voiceEmojiUsageEnum = pgEnum('voice_emoji_usage', ['never', 'sparse', 'frequent']);

// Lunghezza media messaggi host
export const voiceMessageLengthEnum = pgEnum('voice_message_length', ['short', 'medium', 'long']);

// ─────────────────────────────────────────────────────────────
// PAYOUTS (CLEANER)
// ─────────────────────────────────────────────────────────────

// Stato di un payout al cleaner (€2/kit)
export const payoutStatusEnum = pgEnum('payout_status', [
  'pending', // kit consegnato, in attesa validazione
  'confirmed', // validato (foto cleaner o conferma ospite)
  'scheduled', // aggregato in job mensile, pronto per trasferimento
  'paid', // trasferito via Stripe Connect
  'failed', // errore trasferimento (retry manuale)
  'cancelled', // annullato (kit contestato)
]);

// Come è stato validato il payout
export const payoutValidationMethodEnum = pgEnum('payout_validation_method', [
  'cleaner_photo', // foto cleaner (primario)
  'guest_confirmation', // fallback conferma ospite entro 24h
  'manual', // forzato da host/admin
]);

// ─────────────────────────────────────────────────────────────
// SERVIZI EXTRA (catalogo ospite + upsell)
// ─────────────────────────────────────────────────────────────

// Famiglia di servizio venduto all'ospite. Guida il raggruppamento nel
// catalogo e il matching per parola chiave delle risposte automatiche.
export const serviceCategoryEnum = pgEnum('service_category', [
  'boat_tour',
  'transfer',
  'chef',
  'cleaning',
  'wellness',
  'rental',
  'food_delivery',
  'other',
]);

// Da dove arriva la manifestazione di interesse per un servizio.
export const serviceInquirySourceEnum = pgEnum('service_inquiry_source', [
  'catalog_cta', // tap sul pulsante WhatsApp nel catalogo
  'whatsapp_inbound', // intent riconosciuto in chat
  'manual', // registrato a mano dall'host
]);

// ─────────────────────────────────────────────────────────────
// CONSENSO WHATSAPP (prova GDPR)
// ─────────────────────────────────────────────────────────────

// Evento del registro consensi. Append-only: 'grant' e 'revoke' si
// alternano, lo stato corrente è l'ultimo evento in ordine di tempo.
export const consentActionEnum = pgEnum('consent_action', ['grant', 'revoke']);

// Canale attraverso cui il consenso è stato raccolto o revocato.
export const consentSourceEnum = pgEnum('consent_source', [
  'guest_form', // form pubblico nell'app ospite
  'admin_panel', // inserimento/spunta manuale dell'host
  'whatsapp_reply', // ospite scrive STOP / conferma in chat
  'import_csv', // import da export Chekin
]);

// ─────────────────────────────────────────────────────────────
// INVII AUTOMATICI (scheduler + paracadute)
// ─────────────────────────────────────────────────────────────

// I tre momenti del soggiorno in cui parte un messaggio automatico.
// Fuso di riferimento Europe/Rome.
//
// Consenso richiesto per trigger (policy applicata nel send guard):
//  - welcome  → NO  (comunicazione di servizio sulla prenotazione)
//  - midstay  → SÌ  (contenuto commerciale: link ai servizi)
//  - checkout → NO  (ringraziamento + richiesta recensione)
//
// Mappatura verso messageStageEnum, per l'audit trail in messages:
//  welcome → pre_arrival_welcome, midstay → mid_stay_checkin,
//  checkout → post_stay_review_nudge.
export const outboundTriggerEnum = pgEnum('outbound_trigger', [
  'welcome',
  'midstay',
  'checkout',
  // Invito guest app appena compare il numero (flusso canonico §2b).
  'guest_app_invite',
]);

// Ciclo di vita di uno slot di invio.
//  reserved → lo slot è stato preso, l'invio non è ancora partito
//  skipped  → condizione di guardia non soddisfatta (no consenso,
//             numero non su WhatsApp, kill switch, tetto giornaliero)
export const outboundSendStatusEnum = pgEnum('outbound_send_status', [
  'reserved',
  'sent',
  'failed',
  'skipped',
]);

// ─────────────────────────────────────────────────────────────
// LOCAL PARTNERS / AGENT ACTIONS
// ─────────────────────────────────────────────────────────────

// Tipologia di partner locale (fornitori kit alternativi ad Amazon)
export const localPartnerTypeEnum = pgEnum('local_partner_type', [
  'food',
  'wine',
  'pastry',
  'coffee',
  'flowers',
  'artisan',
  'other',
]);

// Agente che ha eseguito l'azione loggata
export const agentTypeEnum = pgEnum('agent_type', [
  'guest_dna', // Agent 1
  'kit_composer', // Agent 2
  'message_writer', // Agent 3
  'conversation', // Agent 4
  'onboarding', // Agent 5
  'system', // azioni automatiche non-agent (scheduler, webhook)
]);

// Esito dell'azione agente
export const agentActionStatusEnum = pgEnum('agent_action_status', [
  'success',
  'error',
  'partial', // eseguita ma con warning (es. fallback fornitore)
]);

// Esito del recovery post-feedback negativo
export const reviewRecoveryOutcomeEnum = pgEnum('review_recovery_outcome', [
  'recovered', // ospite lascia comunque recensione positiva o nessuna
  'negative_posted', // ospite ha comunque pubblicato recensione negativa
  'no_response', // ospite non ha risposto al recovery
  'pending', // in corso
]);

// Stato operativo di un fornitore di servizi (providers).
// 'suspended' = censito ma fuori dal routing (ferie, contratto sospeso).
export const providerStatusEnum = pgEnum('provider_status', ['active', 'suspended']);
