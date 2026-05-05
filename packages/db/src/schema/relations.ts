import { relations } from 'drizzle-orm';
import { agentActions } from './agent-actions';
import { autopilotRules } from './autopilot-rules';
import { bookingEmailEvents } from './booking-email-events';
import { bookings } from './bookings';
import { cleaners } from './cleaners';
import { conversations } from './conversations';
import { guestProfiles } from './guest-profiles';
import { guestQuizzes } from './guest-quizzes';
import { hostVoiceProfiles } from './host-voice-profiles';
import { hosts } from './hosts';
import { kits } from './kits';
import { localPartners } from './local-partners';
import { messages } from './messages';
import { pendingDrafts } from './pending-drafts';
import { pendingPayouts } from './pending-payouts';
import { properties } from './properties';
import { propertyKnowledge } from './property-knowledge';
import { reviews } from './reviews';

// ─────────────────────────────────────────────────────────────
// HOST
// ─────────────────────────────────────────────────────────────

export const hostsRelations = relations(hosts, ({ one, many }) => ({
  properties: many(properties),
  cleaners: many(cleaners),
  voiceProfile: one(hostVoiceProfiles, {
    fields: [hosts.id],
    references: [hostVoiceProfiles.hostId],
  }),
  autopilotRules: many(autopilotRules),
  pendingDrafts: many(pendingDrafts),
  agentActions: many(agentActions),
  localPartners: many(localPartners),
}));

export const hostVoiceProfilesRelations = relations(hostVoiceProfiles, ({ one }) => ({
  host: one(hosts, { fields: [hostVoiceProfiles.hostId], references: [hosts.id] }),
}));

export const autopilotRulesRelations = relations(autopilotRules, ({ one }) => ({
  host: one(hosts, { fields: [autopilotRules.hostId], references: [hosts.id] }),
}));

// ─────────────────────────────────────────────────────────────
// PROPERTIES
// ─────────────────────────────────────────────────────────────

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  host: one(hosts, { fields: [properties.hostId], references: [hosts.id] }),
  cleaner: one(cleaners, { fields: [properties.cleanerId], references: [cleaners.id] }),
  bookings: many(bookings),
  knowledge: one(propertyKnowledge, {
    fields: [properties.id],
    references: [propertyKnowledge.propertyId],
  }),
}));

export const propertyKnowledgeRelations = relations(propertyKnowledge, ({ one }) => ({
  property: one(properties, {
    fields: [propertyKnowledge.propertyId],
    references: [properties.id],
  }),
}));

// ─────────────────────────────────────────────────────────────
// CLEANERS
// ─────────────────────────────────────────────────────────────

export const cleanersRelations = relations(cleaners, ({ one, many }) => ({
  host: one(hosts, { fields: [cleaners.hostId], references: [hosts.id] }),
  properties: many(properties),
  pendingPayouts: many(pendingPayouts),
}));

// ─────────────────────────────────────────────────────────────
// BOOKINGS e entità scoped a booking
// ─────────────────────────────────────────────────────────────

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  property: one(properties, { fields: [bookings.propertyId], references: [properties.id] }),
  // Da M2a.3 Fase 2 il profilo è host-scoped e linkato via FK esplicito
  // su bookings (1 profilo → N bookings). bookingId su guest_profiles è
  // legacy nullable, non più chiave logica.
  guestProfile: one(guestProfiles, {
    fields: [bookings.guestProfileId],
    references: [guestProfiles.id],
  }),
  quiz: one(guestQuizzes, { fields: [bookings.id], references: [guestQuizzes.bookingId] }),
  kit: one(kits, { fields: [bookings.id], references: [kits.bookingId] }),
  review: one(reviews, { fields: [bookings.id], references: [reviews.bookingId] }),
  conversations: many(conversations),
  messages: many(messages),
  pendingDrafts: many(pendingDrafts),
  agentActions: many(agentActions),
}));

export const guestProfilesRelations = relations(guestProfiles, ({ one, many }) => ({
  host: one(hosts, { fields: [guestProfiles.hostId], references: [hosts.id] }),
  // Booking legacy: bookingId nullable, può essere null se il profilo
  // viene dal sync email prima del link a una booking specifica.
  legacyBooking: one(bookings, {
    fields: [guestProfiles.bookingId],
    references: [bookings.id],
  }),
  bookings: many(bookings),
}));

export const guestQuizzesRelations = relations(guestQuizzes, ({ one }) => ({
  booking: one(bookings, { fields: [guestQuizzes.bookingId], references: [bookings.id] }),
}));

export const kitsRelations = relations(kits, ({ one, many }) => ({
  booking: one(bookings, { fields: [kits.bookingId], references: [bookings.id] }),
  pendingPayouts: many(pendingPayouts),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  booking: one(bookings, { fields: [reviews.bookingId], references: [bookings.id] }),
}));

// ─────────────────────────────────────────────────────────────
// CONVERSATIONS / MESSAGES / DRAFTS
// ─────────────────────────────────────────────────────────────

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  booking: one(bookings, { fields: [conversations.bookingId], references: [bookings.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  booking: one(bookings, { fields: [messages.bookingId], references: [bookings.id] }),
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  pendingDrafts: many(pendingDrafts),
}));

export const pendingDraftsRelations = relations(pendingDrafts, ({ one }) => ({
  message: one(messages, { fields: [pendingDrafts.messageId], references: [messages.id] }),
  booking: one(bookings, { fields: [pendingDrafts.bookingId], references: [bookings.id] }),
  host: one(hosts, { fields: [pendingDrafts.hostId], references: [hosts.id] }),
}));

// ─────────────────────────────────────────────────────────────
// PAYOUTS / AGENT ACTIONS / LOCAL PARTNERS
// ─────────────────────────────────────────────────────────────

export const pendingPayoutsRelations = relations(pendingPayouts, ({ one }) => ({
  cleaner: one(cleaners, { fields: [pendingPayouts.cleanerId], references: [cleaners.id] }),
  kit: one(kits, { fields: [pendingPayouts.kitId], references: [kits.id] }),
}));

export const agentActionsRelations = relations(agentActions, ({ one }) => ({
  host: one(hosts, { fields: [agentActions.hostId], references: [hosts.id] }),
  booking: one(bookings, { fields: [agentActions.bookingId], references: [bookings.id] }),
}));

export const localPartnersRelations = relations(localPartners, ({ one }) => ({
  host: one(hosts, { fields: [localPartners.hostId], references: [hosts.id] }),
}));

// ─────────────────────────────────────────────────────────────
// BOOKING EMAIL EVENTS (audit trail, M2a.3 Fase 3)
// ─────────────────────────────────────────────────────────────

export const bookingEmailEventsRelations = relations(bookingEmailEvents, ({ one }) => ({
  host: one(hosts, { fields: [bookingEmailEvents.hostId], references: [hosts.id] }),
  booking: one(bookings, {
    fields: [bookingEmailEvents.bookingId],
    references: [bookings.id],
  }),
}));
