import { pgEnum } from 'drizzle-orm/pg-core';

// Tutti gli enum pgEnum del progetto sono centralizzati qui:
// i nomi sono unici a livello di database Postgres, quindi
// raccogliere tutto in un unico file previene collisioni.

// ─────────────────────────────────────────────────────────────
// BOOKINGS / PROPERTIES
// ─────────────────────────────────────────────────────────────

// Piattaforma origine di una prenotazione
export const platformEnum = pgEnum('platform', ['booking', 'airbnb', 'direct']);

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
  'pending_dna', // in attesa di Guest DNA
  'pending_quiz', // in attesa che l'ospite completi il quiz
  'composing', // agent sta componendo
  'awaiting_approval', // in attesa di conferma host (se non auto-approva)
  'ordered', // ordine inviato al fornitore
  'delivered_to_cleaner', // consegnato a casa cleaner
  'placed_in_property', // cleaner ha sistemato nella struttura
  'confirmed_by_guest', // ospite ha confermato
  'failed', // fallimento in uno step (notifica host)
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
