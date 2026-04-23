import { generateGuestDna, composeKit, writeMessage } from '@premura/agents';

/**
 * Main workflow triggered by webhook from Booking.com or Airbnb
 * when a new booking is confirmed.
 *
 * Steps:
 *  1. Persist booking
 *  2. OSINT enrichment (public reviews, professional profile hints)
 *  3. Generate Guest DNA
 *  4. If confidence < 0.7 → send quiz; wait for response; re-run DNA
 *  5. Compose kit based on host budget
 *  6. If host requires approval → send push; else auto-approve
 *  7. Place supplier order (Amazon/Cortilia/partner) to cleaner's address
 *  8. Brief cleaner via WhatsApp
 *  9. Schedule pre-arrival message (T-24h) and day-2 check-in
 *
 * This is deliberately a thin orchestrator: each step delegates to a
 * specialized module. It must remain readable top-to-bottom.
 */

type OnNewBookingInput = {
  bookingId: string; // UUID in our DB, already persisted
};

export async function onNewBooking(input: OnNewBookingInput): Promise<void> {
  const booking = await loadBookingFull(input.bookingId);

  // 1. OSINT enrichment (best-effort, non-blocking)
  const enrichment = await tryEnrichGuest(booking).catch(() => undefined);

  // 2. Guest DNA
  const dna = await generateGuestDna({
    guest: {
      fullName: booking.guestFullName,
      countryCode: booking.guestCountryCode,
      ageApprox: booking.guestAgeApprox,
      email: booking.guestEmail,
    },
    booking: {
      platform: booking.platform,
      checkinAt: booking.checkinAt,
      checkoutAt: booking.checkoutAt,
      nights: booking.nights,
      numAdults: booking.numAdults,
      numChildren: booking.numChildren,
      totalPriceEur: booking.totalPriceEur,
      guestNote: booking.guestNote,
    },
    property: {
      name: booking.property.name,
      city: booking.property.city,
      agentNotes: booking.property.agentNotes,
    },
    enrichment,
  });

  await saveDna(booking.id, dna);

  // 3. Low confidence → quiz flow (pauses this workflow; resumed by quiz response handler)
  if (dna.confidence < 0.7) {
    await triggerQuizFlow(booking.id);
    return;
  }

  // 4. Compose kit
  const budgetEur = Number(booking.property.kitBudgetEur ?? booking.host.defaultKitBudgetEur);
  const kit = await composeKit({
    dna: {
      archetype: dna.archetype,
      archetypeDescription: dna.archetypeDescription,
      signals: dna.signals,
      risks: dna.risks,
    },
    booking: {
      numAdults: booking.numAdults,
      numChildren: booking.numChildren,
      nights: booking.nights,
    },
    budgetEur,
    property: { city: booking.property.city },
  });

  await saveKit(booking.id, kit, budgetEur);

  // 5. Approval gate
  if (!booking.host.autoApproveKits) {
    await requestHostApproval(booking.id);
    return; // resume on approval webhook
  }

  // 6. Place order (chooses supplier based on lead time + availability)
  await placeSupplierOrder(booking.id);

  // 7. Cleaner brief
  const cleanerMsg = await writeMessage({
    stage: 'cleaner_brief',
    dna,
    booking: {
      guestFirstName: firstName(booking.guestFullName),
      checkinAt: booking.checkinAt,
      checkoutAt: booking.checkoutAt,
      nights: booking.nights,
    },
    property: booking.property,
    kit,
    extra: {
      cleanerName: booking.cleaner?.fullName ?? '',
      cleanerFeeEur: String(booking.cleaner?.perKitFeeEur ?? 2),
    },
  });
  await sendWhatsapp(booking.cleaner?.whatsappNumber, cleanerMsg.body);

  // 8. Pre-arrival message (scheduled T-24h)
  await scheduleAt(booking.checkinAt.getTime() - 24 * 3600_000, 'send_pre_arrival', {
    bookingId: booking.id,
  });

  // 9. Day-2 emotional check-in (scheduled T+38h after check-in, evening of day 2)
  await scheduleAt(booking.checkinAt.getTime() + 38 * 3600_000, 'send_day2_checkin', {
    bookingId: booking.id,
  });

  // 10. Post-stay recovery (24h after checkout)
  await scheduleAt(booking.checkoutAt.getTime() + 24 * 3600_000, 'send_post_stay_recovery', {
    bookingId: booking.id,
  });
}

// ===== STUBS to be implemented in their respective modules =====

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function loadBookingFull(_id: string): Promise<BookingFull> {
  throw new Error('Not implemented: see src/db/queries/bookings.ts');
}

async function tryEnrichGuest(_b: BookingFull): Promise<EnrichmentResult | undefined> {
  // See src/workflows/osint-enrichment.ts (to be built).
  return undefined;
}

async function saveDna(_bookingId: string, _dna: unknown): Promise<void> {
  // See src/db/queries/guest-dna.ts
}

async function saveKit(_bookingId: string, _kit: unknown, _budgetEur: number): Promise<void> {
  // See src/db/queries/kits.ts
}

async function triggerQuizFlow(_bookingId: string): Promise<void> {
  // See src/workflows/quiz-flow.ts
}

async function requestHostApproval(_bookingId: string): Promise<void> {
  // See src/api/dashboard/approvals.ts + push notification
}

async function placeSupplierOrder(_bookingId: string): Promise<void> {
  // See src/workflows/supplier-order.ts (dispatches to amazon/cortilia/glovo based on rules)
}

async function sendWhatsapp(_phone: string | undefined, _body: string): Promise<void> {
  // See src/integrations/whatsapp-business.ts
}

async function scheduleAt(
  _runAtMs: number,
  _jobName: string,
  _payload: Record<string, unknown>,
): Promise<void> {
  // BullMQ delayed job; see src/utils/queue.ts
}

// ===== TYPES =====

type BookingFull = {
  id: string;
  platform: 'booking' | 'airbnb';
  guestFullName: string;
  guestCountryCode?: string;
  guestAgeApprox?: number;
  guestEmail?: string;
  guestNote?: string;
  checkinAt: Date;
  checkoutAt: Date;
  nights: number;
  numAdults: number;
  numChildren: number;
  totalPriceEur?: number;
  property: {
    name: string;
    city: string;
    agentNotes?: string;
    kitBudgetEur?: number;
  };
  host: {
    autoApproveKits: boolean;
    defaultKitBudgetEur: number;
  };
  cleaner?: {
    fullName: string;
    whatsappNumber: string;
    perKitFeeEur: number;
  };
};

type EnrichmentResult = {
  professionGuess?: string;
  socialFlags?: string[];
  publicReviewsLeftElsewhere?: Array<{
    text: string;
    scoreOutOf10: number;
    mentions?: string[];
  }>;
};

function firstName(fullName: string): string {
  return fullName.split(/\s+/)[0] ?? fullName;
}
