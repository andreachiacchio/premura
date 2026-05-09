import { type Database, bookings, guestQuizzes, hosts, kits, properties } from '@premura/db';
import { eq } from 'drizzle-orm';
import { computeKitBudgetEur } from './items-taxonomy';
import {
  KIT_GENERATOR_VERSION,
  type KitGeneratorInput,
  generateKitProposal,
} from './kit-generator-agent';

// ─────────────────────────────────────────────────────────────
// Slice C — Kit pipeline.
//
// Triggered:
//   - apps/api worker (post-survey-completion, fire-and-forget)
//   - manuale dalla dashboard founder (route /dashboard/kits)
//
// Step:
//   1. Fetch context (booking + property + host + survey responses)
//   2. computeKitBudgetEur per nights / hostPayout
//   3. generateKitProposal Sonnet 4.6
//   4. Upsert kits row (status='proposed', items, theme, storytelling,
//      card message, generator metadata)
//   5. Caller fire email founder.
// ─────────────────────────────────────────────────────────────

export type GenerateResult =
  | {
      status: 'generated';
      kitId: string;
      itemCount: number;
      totalEstimatedEur: number;
      withinBudget: boolean;
    }
  | { status: 'skipped_no_booking' }
  | { status: 'skipped_no_survey' }
  | { status: 'skipped_already_proposed'; kitId: string }
  | { status: 'generator_error'; error: string };

export async function triggerKitProposal(db: Database, bookingId: string): Promise<GenerateResult> {
  // Fetch context completo.
  const [bookingRow] = await db
    .select({
      bookingId: bookings.id,
      nights: bookings.nights,
      numAdults: bookings.numAdults,
      numChildren: bookings.numChildren,
      guestCountryCode: bookings.guestCountryCode,
      guestLanguage: bookings.guestLanguage,
      checkinAt: bookings.checkinAt,
      checkoutAt: bookings.checkoutAt,
      hostPayoutAmount: bookings.hostPayoutAmount,
      totalPriceEur: bookings.totalPriceEur,
      guestFirstName: bookings.guestFirstName,
      guestFullName: bookings.guestFullName,
      propertyName: properties.name,
      propertyCity: properties.city,
      hostId: properties.hostId,
      hostFullName: hosts.fullName,
    })
    .from(bookings)
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .innerJoin(hosts, eq(properties.hostId, hosts.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!bookingRow) return { status: 'skipped_no_booking' };

  // Survey: trovare guest_quizzes completed per il booking.
  const [quizRow] = await db
    .select({
      responses: guestQuizzes.responses,
      language: guestQuizzes.language,
      completedAt: guestQuizzes.completedAt,
    })
    .from(guestQuizzes)
    .where(eq(guestQuizzes.bookingId, bookingId))
    .limit(1);
  if (!quizRow || !quizRow.completedAt) {
    return { status: 'skipped_no_survey' };
  }

  // Idempotency: kit gia' proposto?
  const [existing] = await db
    .select({ id: kits.id, status: kits.status })
    .from(kits)
    .where(eq(kits.bookingId, bookingId))
    .limit(1);
  if (
    existing &&
    existing.status !== 'pending_dna' &&
    existing.status !== 'pending_quiz' &&
    existing.status !== 'pending_survey'
  ) {
    return { status: 'skipped_already_proposed', kitId: existing.id };
  }

  // Budget tier.
  const hostPayoutEur = bookingRow.hostPayoutAmount
    ? Number(bookingRow.hostPayoutAmount)
    : bookingRow.totalPriceEur
      ? Number(bookingRow.totalPriceEur) * 0.85 // fallback: 85% del totale (post-channel-fee tipico)
      : 100; // ultimate fallback
  const budgetTargetEur = computeKitBudgetEur({ nights: bookingRow.nights, hostPayoutEur });

  // Survey responses parsing (slice B shape).
  const responses = (quizRow.responses ?? {}) as Record<string, string | string[]>;
  const occRaw = responses.occasion;
  const occasion = Array.isArray(occRaw) ? occRaw[0] : occRaw;
  const allRaw = responses.allergies;
  const foodAllergies = Array.isArray(allRaw) ? allRaw.join(', ') : allRaw;
  const morningRaw = responses.morning ?? responses.preferences;
  const preferences = Array.isArray(morningRaw) ? morningRaw[0] : morningRaw;

  const language: 'it' | 'en' = quizRow.language === 'en' ? 'en' : 'it';

  const input: KitGeneratorInput = {
    booking: {
      nights: bookingRow.nights,
      numAdults: bookingRow.numAdults,
      numChildren: bookingRow.numChildren,
      guestCountryCode: bookingRow.guestCountryCode,
      checkinAt: bookingRow.checkinAt,
      checkoutAt: bookingRow.checkoutAt,
      hostPayoutEur,
      guestFirstName: bookingRow.guestFirstName,
      guestFullName: bookingRow.guestFullName,
      language,
    },
    survey: { specialOccasion: occasion, foodAllergies, preferences, raw: responses },
    property: { name: bookingRow.propertyName, city: bookingRow.propertyCity ?? '' },
    host: { fullName: bookingRow.hostFullName },
    budgetTargetEur,
  };

  let proposal: Awaited<ReturnType<typeof generateKitProposal>>;
  try {
    proposal = await generateKitProposal(input);
  } catch (err) {
    return {
      status: 'generator_error',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const now = new Date();

  if (existing) {
    await db
      .update(kits)
      .set({
        status: 'proposed',
        items: proposal.items,
        theme: proposal.theme,
        storytellingIt: proposal.storytellingIt,
        storytellingEn: proposal.storytellingEn,
        cardMessage: proposal.cardMessageIt,
        cardMessageEn: proposal.cardMessageEn,
        rationale: proposal.rationale,
        budgetEur: budgetTargetEur.toFixed(2),
        itemsTotalEur: proposal.totalEstimatedEur.toFixed(2),
        proposalGeneratedAt: now,
        generatorAgentVersion: proposal.agentVersion,
        generatorCostUsd: proposal.costUsd.toFixed(6),
        guestLanguage: language,
        updatedAt: now,
      })
      .where(eq(kits.id, existing.id));
    return {
      status: 'generated',
      kitId: existing.id,
      itemCount: proposal.items.length,
      totalEstimatedEur: proposal.totalEstimatedEur,
      withinBudget: proposal.withinBudget,
    };
  }

  const [inserted] = await db
    .insert(kits)
    .values({
      bookingId,
      status: 'proposed',
      items: proposal.items,
      theme: proposal.theme,
      storytellingIt: proposal.storytellingIt,
      storytellingEn: proposal.storytellingEn,
      cardMessage: proposal.cardMessageIt,
      cardMessageEn: proposal.cardMessageEn,
      rationale: proposal.rationale,
      budgetEur: budgetTargetEur.toFixed(2),
      itemsTotalEur: proposal.totalEstimatedEur.toFixed(2),
      proposalGeneratedAt: now,
      generatorAgentVersion: proposal.agentVersion,
      generatorCostUsd: proposal.costUsd.toFixed(6),
      guestLanguage: language,
    })
    .returning({ id: kits.id });
  if (!inserted) {
    return { status: 'generator_error', error: 'kits insert returned no row' };
  }

  return {
    status: 'generated',
    kitId: inserted.id,
    itemCount: proposal.items.length,
    totalEstimatedEur: proposal.totalEstimatedEur,
    withinBudget: proposal.withinBudget,
  };
}

export { KIT_GENERATOR_VERSION };
