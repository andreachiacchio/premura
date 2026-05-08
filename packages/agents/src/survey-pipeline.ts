import type { Database } from '@premura/db';
import { bookings, guestQuizzes, hosts, properties } from '@premura/db';
import type { ConversationTurn, ConversationalSurveyResponses } from '@premura/db';
import { and, asc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { conductSurveyTurn, isSurveyComplete } from './survey-conductor';

// ─────────────────────────────────────────────────────────────
// Slice B — Survey pre-arrival pipeline.
//
// Due entry point:
//
// 1. SENDER (apps/api cron): findBookingsForSurveySend → per ogni booking
//    matched, startSurvey() invia il primo messaggio template + insert
//    guest_quizzes.
//
// 2. RECEIVER (apps/api whatsapp webhook): processSurveyInbound, chiamato
//    quando arriva un messaggio guest e c'e' una survey attiva per
//    quel booking. Esegue 1 turn Sonnet, persiste, eventualmente
//    completa o declina.
//
// 3. TIMEOUT FALLBACK (apps/api cron): findStaleSurveys per i 48h e
//    96h timeout. 48h → re-invia messaggio nudge. 96h → skipped.
//
// La pipeline stessa NON manda messaggi WhatsApp: ritorna l'output
// (msg da inviare, status), il caller (apps/api worker) si occupa
// di chiamare sendText e persistere il messaggio outbound.
// ─────────────────────────────────────────────────────────────

const SEND_WINDOW_DAYS_BEFORE_CHECKIN = 7;
const SEND_WINDOW_TOLERANCE_DAYS = 1; // [now+6, now+8] per cattura giornaliera.
const NUDGE_AFTER_HOURS = 48;
const ABANDON_AFTER_HOURS = 96;

export type SurveySendCandidate = {
  bookingId: string;
  hostId: string;
  guestPhone: string;
  guestFirstName: string | null;
  guestFullName: string;
  language: 'it' | 'en';
  hostName: string;
  propertyName: string;
};

// Cron 1: trova booking eligible per primo messaggio survey.
//  - check-in tra now+6 e now+8 giorni
//  - guest_phone valorizzato (slice A premura_active_at)
//  - non cancellata
//  - nessuna survey gia' aperta (left-join guest_quizzes con sent_at)
export async function findBookingsForSurveySend(
  db: Database,
  now: Date = new Date(),
): Promise<SurveySendCandidate[]> {
  const lowerBound = new Date(now);
  lowerBound.setDate(
    lowerBound.getDate() + SEND_WINDOW_DAYS_BEFORE_CHECKIN - SEND_WINDOW_TOLERANCE_DAYS,
  );
  const upperBound = new Date(now);
  upperBound.setDate(
    upperBound.getDate() + SEND_WINDOW_DAYS_BEFORE_CHECKIN + SEND_WINDOW_TOLERANCE_DAYS,
  );

  // LEFT JOIN guest_quizzes: una booking ha gia' una survey se esiste row
  // con sent_at NOT NULL. Filtriamo per "no row" o "sent_at IS NULL"
  // (pre-survey state).
  const rows = await db
    .select({
      bookingId: bookings.id,
      hostId: properties.hostId,
      guestPhone: bookings.guestPhone,
      guestFirstName: bookings.guestFirstName,
      guestFullName: bookings.guestFullName,
      guestCountryCode: bookings.guestCountryCode,
      guestLanguage: bookings.guestLanguage,
      hostFullName: hosts.fullName,
      propertyName: properties.name,
      quizSentAt: guestQuizzes.sentAt,
    })
    .from(bookings)
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .innerJoin(hosts, eq(properties.hostId, hosts.id))
    .leftJoin(guestQuizzes, eq(guestQuizzes.bookingId, bookings.id))
    .where(
      and(
        gte(bookings.checkinAt, lowerBound),
        lte(bookings.checkinAt, upperBound),
        eq(bookings.status, 'confirmed'),
        // guest_phone NOT NULL = booking attivato Premura (slice A).
        // Filtriamo via predicate nativo Drizzle:
        // eq sull'inversa non funziona per IS NOT NULL, quindi usiamo
        // sql template via and() con predicate.
      ),
    )
    .orderBy(asc(bookings.checkinAt));

  // Filtro post-fetch per:
  //  - guest_phone NOT NULL (Drizzle SQL is awkward for IS NOT NULL combined)
  //  - quizSentAt NULL (no survey already sent)
  return rows
    .filter((r) => r.guestPhone && r.quizSentAt === null)
    .map((r) => ({
      bookingId: r.bookingId,
      hostId: r.hostId,
      guestPhone: r.guestPhone as string,
      guestFirstName: r.guestFirstName,
      guestFullName: r.guestFullName,
      language: pickLanguage(r.guestLanguage, r.guestCountryCode),
      hostName: r.hostFullName ?? 'il tuo host',
      propertyName: r.propertyName,
    }));
}

// Template primo messaggio (NO LLM, deterministico per consistency).
// Personalizzato con first_name + host_name + property_name.
export function buildFirstMessage(input: {
  language: 'it' | 'en';
  guestFirstName: string;
  hostName: string;
  propertyName: string;
}): string {
  const fname = input.guestFirstName;
  if (input.language === 'en') {
    return `Hi ${fname} 👋 I'm Premura, ${input.hostName}'s assistant for ${input.propertyName}. ${input.hostName} wants to prepare the apartment to make you feel at home. May I ask you 3 quick questions?`;
  }
  return `Ciao ${fname} 👋 Sono Premura, l'assistente di ${input.hostName} per ${input.propertyName}. ${input.hostName} vuole prepararti la casa al meglio. Posso farti 3 domande veloci?`;
}

// Crea/upsert riga guest_quizzes per il booking + segna sent_at.
// Idempotente: se gia' esiste row con sent_at, no-op.
export async function startSurvey(
  db: Database,
  candidate: SurveySendCandidate,
): Promise<{ status: 'started' | 'already_started'; quizId: string; firstMessage: string }> {
  const firstName =
    candidate.guestFirstName ?? candidate.guestFullName.split(/\s+/)[0] ?? 'gentile ospite';
  const message = buildFirstMessage({
    language: candidate.language,
    guestFirstName: firstName,
    hostName: candidate.hostName,
    propertyName: candidate.propertyName,
  });
  const now = new Date();

  // Lookup esistente.
  const [existing] = await db
    .select({ id: guestQuizzes.id, sentAt: guestQuizzes.sentAt })
    .from(guestQuizzes)
    .where(eq(guestQuizzes.bookingId, candidate.bookingId))
    .limit(1);

  if (existing?.sentAt) {
    return { status: 'already_started', quizId: existing.id, firstMessage: message };
  }

  if (existing) {
    await db
      .update(guestQuizzes)
      .set({
        sentAt: now,
        language: candidate.language,
        lastOutboundAt: now,
        conversationMessages: [{ role: 'premura', content: message, ts: now.toISOString() }],
      })
      .where(eq(guestQuizzes.id, existing.id));
    return { status: 'started', quizId: existing.id, firstMessage: message };
  }

  const [inserted] = await db
    .insert(guestQuizzes)
    .values({
      bookingId: candidate.bookingId,
      sentAt: now,
      language: candidate.language,
      lastOutboundAt: now,
      questions: [],
      responses: {},
      conversationMessages: [{ role: 'premura', content: message, ts: now.toISOString() }],
    })
    .returning({ id: guestQuizzes.id });
  if (!inserted) throw new Error('startSurvey: insert returned no row');
  return { status: 'started', quizId: inserted.id, firstMessage: message };
}

// Lookup survey attiva per un booking (sent_at NOT NULL, completed_at +
// skipped_at NULL). Usato dal webhook per decidere routing.
export async function findActiveSurvey(
  db: Database,
  bookingId: string,
): Promise<{
  quizId: string;
  language: 'it' | 'en';
  responses: ConversationalSurveyResponses;
  conversation: ConversationTurn[];
} | null> {
  const [row] = await db
    .select({
      id: guestQuizzes.id,
      language: guestQuizzes.language,
      responses: guestQuizzes.responses,
      conversationMessages: guestQuizzes.conversationMessages,
      sentAt: guestQuizzes.sentAt,
      completedAt: guestQuizzes.completedAt,
      skippedAt: guestQuizzes.skippedAt,
    })
    .from(guestQuizzes)
    .where(eq(guestQuizzes.bookingId, bookingId))
    .limit(1);
  if (!row) return null;
  if (!row.sentAt || row.completedAt || row.skippedAt) return null;
  return {
    quizId: row.id,
    language: row.language as 'it' | 'en',
    responses: (row.responses as ConversationalSurveyResponses) ?? {},
    conversation: row.conversationMessages,
  };
}

// Receiver: processa messaggio inbound del guest.
// Chiama Sonnet 4.6 turn, merge extracted fields, persiste, ritorna
// risultato per il caller (worker) che invia outbound.
export type ProcessInboundResult =
  | {
      status: 'continue' | 'completed';
      replyMessage: string;
      responses: ConversationalSurveyResponses;
    }
  | { status: 'declined'; replyMessage: string }
  | { status: 'error'; error: string };

export async function processSurveyInbound(
  db: Database,
  input: {
    bookingId: string;
    guestMessage: string;
    guestFirstName: string;
    hostName: string;
    propertyName: string;
  },
): Promise<ProcessInboundResult> {
  const active = await findActiveSurvey(db, input.bookingId);
  if (!active) return { status: 'error', error: 'no_active_survey' };

  const now = new Date();
  // Append guest message a conversation log + persist immediato (cosi' se
  // l'agent fail, il messaggio guest resta tracciato).
  const updatedConversation: ConversationTurn[] = [
    ...active.conversation,
    { role: 'guest', content: input.guestMessage, ts: now.toISOString() },
  ];
  await db
    .update(guestQuizzes)
    .set({ conversationMessages: updatedConversation, lastInboundAt: now })
    .where(eq(guestQuizzes.id, active.quizId));

  // Chiama agent.
  let turn: Awaited<ReturnType<typeof conductSurveyTurn>>;
  try {
    turn = await conductSurveyTurn({
      language: active.language,
      guestFirstName: input.guestFirstName,
      hostName: input.hostName,
      propertyName: input.propertyName,
      conversation: updatedConversation.map((t) => ({ role: t.role, content: t.content })),
      alreadyExtracted: active.responses,
    });
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }

  // Merge extracted fields (preserve esistenti, sovrascrivi con nuovi).
  const mergedResponses: ConversationalSurveyResponses = {
    ...active.responses,
    ...turn.extracted,
  };

  // Append agent reply a conversation.
  const finalConversation: ConversationTurn[] = [
    ...updatedConversation,
    { role: 'premura', content: turn.message, ts: new Date().toISOString() },
  ];

  // Determina stato finale.
  if (turn.declined) {
    await db
      .update(guestQuizzes)
      .set({
        skippedAt: new Date(),
        skippedReason: 'guest_declined',
        responses: mergedResponses,
        conversationMessages: finalConversation,
        lastOutboundAt: new Date(),
      })
      .where(eq(guestQuizzes.id, active.quizId));
    return { status: 'declined', replyMessage: turn.message };
  }

  // Completion: trust turn.completed se l'agent l'ha emesso, OR fallback
  // su isSurveyComplete (tutti e 3 i fields presenti).
  const completed = turn.completed || isSurveyComplete(mergedResponses);
  if (completed) {
    await db
      .update(guestQuizzes)
      .set({
        completedAt: new Date(),
        responses: mergedResponses,
        conversationMessages: finalConversation,
        lastOutboundAt: new Date(),
      })
      .where(eq(guestQuizzes.id, active.quizId));
    return {
      status: 'completed',
      replyMessage: turn.message,
      responses: mergedResponses,
    };
  }

  // Continue: persist progress.
  await db
    .update(guestQuizzes)
    .set({
      responses: mergedResponses,
      conversationMessages: finalConversation,
      lastOutboundAt: new Date(),
    })
    .where(eq(guestQuizzes.id, active.quizId));
  return {
    status: 'continue',
    replyMessage: turn.message,
    responses: mergedResponses,
  };
}

// Cron 2: trova survey stale per nudge / abandon.
export type StaleSurvey = {
  quizId: string;
  bookingId: string;
  guestPhone: string;
  guestFirstName: string;
  hostName: string;
  propertyName: string;
  language: 'it' | 'en';
  hoursSinceLastOutbound: number;
  action: 'nudge' | 'abandon';
};

export async function findStaleSurveys(
  db: Database,
  now: Date = new Date(),
): Promise<StaleSurvey[]> {
  const nudgeThreshold = new Date(now.getTime() - NUDGE_AFTER_HOURS * 60 * 60 * 1000);
  const abandonThreshold = new Date(now.getTime() - ABANDON_AFTER_HOURS * 60 * 60 * 1000);

  const rows = await db
    .select({
      quizId: guestQuizzes.id,
      bookingId: guestQuizzes.bookingId,
      lastOutboundAt: guestQuizzes.lastOutboundAt,
      lastInboundAt: guestQuizzes.lastInboundAt,
      language: guestQuizzes.language,
      guestPhone: bookings.guestPhone,
      guestFirstName: bookings.guestFirstName,
      guestFullName: bookings.guestFullName,
      hostFullName: hosts.fullName,
      propertyName: properties.name,
    })
    .from(guestQuizzes)
    .innerJoin(bookings, eq(guestQuizzes.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .innerJoin(hosts, eq(properties.hostId, hosts.id))
    .where(
      and(
        isNull(guestQuizzes.completedAt),
        isNull(guestQuizzes.skippedAt),
        // sent_at NOT NULL filtrato post-fetch (Drizzle awkward).
      ),
    );

  const out: StaleSurvey[] = [];
  for (const r of rows) {
    if (!r.lastOutboundAt || !r.guestPhone) continue;
    // Se l'ultimo turn e' inbound, vuol dire che siamo "in palla" — guest
    // ha risposto e l'agent ha gia' replicato. NO nudge in quel caso.
    // Solo se lastInboundAt < lastOutboundAt (premura aspetta guest)
    // valutiamo timeout.
    const lastInbound = r.lastInboundAt?.getTime() ?? 0;
    const lastOutbound = r.lastOutboundAt.getTime();
    if (lastInbound > lastOutbound) continue;

    const ageMs = now.getTime() - lastOutbound;
    const ageHours = ageMs / (60 * 60 * 1000);

    if (ageMs >= ABANDON_AFTER_HOURS * 60 * 60 * 1000) {
      out.push({
        quizId: r.quizId,
        bookingId: r.bookingId,
        guestPhone: r.guestPhone,
        guestFirstName: r.guestFirstName ?? r.guestFullName.split(/\s+/)[0] ?? 'gentile ospite',
        hostName: r.hostFullName ?? 'host',
        propertyName: r.propertyName,
        language: r.language as 'it' | 'en',
        hoursSinceLastOutbound: ageHours,
        action: 'abandon',
      });
    } else if (ageMs >= NUDGE_AFTER_HOURS * 60 * 60 * 1000) {
      out.push({
        quizId: r.quizId,
        bookingId: r.bookingId,
        guestPhone: r.guestPhone,
        guestFirstName: r.guestFirstName ?? r.guestFullName.split(/\s+/)[0] ?? 'gentile ospite',
        hostName: r.hostFullName ?? 'host',
        propertyName: r.propertyName,
        language: r.language as 'it' | 'en',
        hoursSinceLastOutbound: ageHours,
        action: 'nudge',
      });
    }
  }
  return out;
}

export function buildNudgeMessage(input: {
  language: 'it' | 'en';
  guestFirstName: string;
}): string {
  if (input.language === 'en') {
    return `Hi ${input.guestFirstName}, no pressure — even one quick answer helps us prepare for your stay 🙂`;
  }
  return `Ciao ${input.guestFirstName}, nessuna fretta — anche una sola risposta ci aiuta a prepararti il soggiorno 🙂`;
}

export async function markSurveyAbandoned(db: Database, quizId: string): Promise<void> {
  await db
    .update(guestQuizzes)
    .set({
      skippedAt: new Date(),
      skippedReason: 'no_response_96h',
    })
    .where(eq(guestQuizzes.id, quizId));
}

export async function recordSurveyOutbound(
  db: Database,
  quizId: string,
  message: string,
): Promise<void> {
  const [row] = await db
    .select({ conversationMessages: guestQuizzes.conversationMessages })
    .from(guestQuizzes)
    .where(eq(guestQuizzes.id, quizId))
    .limit(1);
  if (!row) return;
  const now = new Date();
  await db
    .update(guestQuizzes)
    .set({
      conversationMessages: [
        ...row.conversationMessages,
        { role: 'premura', content: message, ts: now.toISOString() },
      ],
      lastOutboundAt: now,
    })
    .where(eq(guestQuizzes.id, quizId));
}

function pickLanguage(guestLanguage: string | null, countryCode: string | null): 'it' | 'en' {
  if (guestLanguage === 'it' || guestLanguage === 'en') return guestLanguage;
  if (guestLanguage?.startsWith('it')) return 'it';
  if (countryCode === 'IT') return 'it';
  return 'en';
}
