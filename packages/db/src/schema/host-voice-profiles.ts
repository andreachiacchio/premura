import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core';
import {
  voiceFormalityEnum,
  voiceEmojiUsageEnum,
  voiceMessageLengthEnum,
} from './enums';
import { hosts } from './hosts';

// Voice profile dell'host: cattura il tono con cui l'agente
// Message Writer / Conversation scriverà agli ospiti.
// Compilato in onboarding (3-4 domande) + opzionale analisi messaggi passati.
//
// Un profilo per host (UNIQUE host_id).
export const hostVoiceProfiles = pgTable('host_voice_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  hostId: uuid('host_id')
    .notNull()
    .unique()
    .references(() => hosts.id, { onDelete: 'cascade' }),

  // Modo 1 — estratto dalle domande dirette
  formality: voiceFormalityEnum('formality').notNull().default('tu'),
  emojiUsage: voiceEmojiUsageEnum('emoji_usage').notNull().default('sparse'),
  // Esempi espliciti di emoji che l'host userebbe (es. ["👋","🌿","☕"])
  emojiExamples: jsonb('emoji_examples').$type<string[]>().default([]),
  // Es. "— Andrea", "La famiglia Chiacchio", "— La Goccia di S.Gennaro"
  signatureStyle: text('signature_style'),
  avgMessageLength: voiceMessageLengthEnum('avg_message_length').notNull().default('medium'),
  // Parole-chiave del tono (es. ["caldo","diretto","napoletano","rassicurante"])
  toneKeywords: jsonb('tone_keywords').$type<string[]>().default([]),

  // Modo 2 — analisi messaggi passati (opzionale)
  sampleMessagesAnalyzed: integer('sample_messages_analyzed').notNull().default(0),
  // Pattern linguistici strutturati estratti da Claude (formalità, lunghezza, punteggiatura, ...)
  extractedPatterns: jsonb('extracted_patterns').$type<VoiceExtractedPatterns>(),
  exampleGreetings: jsonb('example_greetings').$type<string[]>().default([]),
  exampleClosings: jsonb('example_closings').$type<string[]>().default([]),

  lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Pattern estratti automaticamente dall'analisi dei messaggi storici dell'host.
// Usato dall'agente Message Writer / Conversation come "voice sample".
export type VoiceExtractedPatterns = {
  // Media caratteri per messaggio
  avgCharLength?: number;
  // Uso di punteggiatura finale (es. "." vs "!" vs assente)
  punctuationStyle?: 'minimal' | 'standard' | 'expressive';
  // Parole ricorrenti tipiche di questo host
  signatureWords?: string[];
  // Apertura tipica (es. "Ciao!", "Buongiorno,", "Hey")
  openingPattern?: string;
  // Chiusura tipica
  closingPattern?: string;
  // Lingue padroneggiate dall'host (ISO 639-1)
  languages?: string[];
};
