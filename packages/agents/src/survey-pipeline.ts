import {
  type Database,
  type QuestionPlan,
  type SurveyResponse,
  bookings,
  guestQuizzes,
  hosts,
  properties,
} from '@premura/db';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { type SurveyPlannerContext, fallbackPlan, planSurvey } from './survey-planner';
import { signSurveyToken, verifySurveyToken } from './survey-token';

// ─────────────────────────────────────────────────────────────
// Slice B — Pre-arrival survey tap-app pipeline.
//
// SENDER (apps/api cron): findBookingsForSurveySend → per ogni booking
//   matched, prepareSurveySend() genera token + planner + WA message.
//   Caller (apps/api worker) chiama sendText e poi markSurveySent.
//
// RECEIVER (apps/web /s/[token]): verifySurveyToken → loadSurveyByToken
//   → render plan. Submit (server action) → submitSurvey → completed_at.
//
// TIMEOUT FALLBACK: findStaleSurveys per 96h skipped automatico.
// ─────────────────────────────────────────────────────────────

const SEND_WINDOW_DAYS_BEFORE_CHECKIN = 7;
const SEND_WINDOW_TOLERANCE_DAYS = 1; // [now+6, now+8] daily catch.
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
      ),
    )
    .orderBy(asc(bookings.checkinAt));

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

export type PreparedSurvey = {
  quizId: string;
  token: string;
  tokenExpiresAt: Date;
  surveyUrl: string;
  questions: QuestionPlan[];
  message: string;
  alreadyPrepared: boolean;
};

// Genera (o riusa) survey per il booking: token + plan + messaggio WA.
// Idempotente: se gia' prepared (sent_at NULL ma row esiste con token),
// ritorna stessi token + plan. Caller (worker) e' responsabile di
// chiamare sendText e poi markSurveySent.
//
// L'host e' dietro l'agente: il cron decide quando, l'host non
// configura nulla.
export async function prepareSurveySend(
  db: Database,
  candidate: SurveySendCandidate,
  baseUrl: string,
  checkinAt: Date,
): Promise<PreparedSurvey> {
  // Lookup esistente: row puo' esistere (slice 4.4 swipe legacy o
  // tentativo precedente fallito). Se sent_at gia' valorizzato, e'
  // gia' inviata: lasciamo stare.
  const [existing] = await db
    .select({
      id: guestQuizzes.id,
      sentAt: guestQuizzes.sentAt,
      token: guestQuizzes.token,
      tokenExpiresAt: guestQuizzes.tokenExpiresAt,
      questionsPlan: guestQuizzes.questionsPlan,
    })
    .from(guestQuizzes)
    .where(eq(guestQuizzes.bookingId, candidate.bookingId))
    .limit(1);

  // Token TTL: 14gg = 7gg fino a checkin + 7gg post-checkin (cuscinetto
  // per guest che apre il link in ritardo).
  const tokenExpiresAtMs = checkinAt.getTime() + 7 * 24 * 60 * 60 * 1000;
  const tokenExpiresAt = new Date(tokenExpiresAtMs);

  // Plan generation (Sonnet 4.6, fallback se errore).
  const ctx = await buildPlannerContext(db, candidate.bookingId);
  let plan: QuestionPlan[];
  try {
    plan = ctx ? (await planSurvey(ctx)).questions : fallbackPlan(fallbackCtx(candidate)).questions;
  } catch {
    plan = ctx ? fallbackPlan(ctx).questions : fallbackPlan(fallbackCtx(candidate)).questions;
  }

  if (existing?.token && existing.tokenExpiresAt && existing.tokenExpiresAt > new Date()) {
    // Riusa token + plan esistenti se ancora validi (idempotency).
    const url = `${baseUrl.replace(/\/$/, '')}/s/${existing.token}`;
    const message = buildMessage({
      language: candidate.language,
      guestFirstName: candidate.guestFirstName ?? candidate.guestFullName.split(/\s+/)[0] ?? '',
      hostName: candidate.hostName,
      propertyName: candidate.propertyName,
      url,
    });
    return {
      quizId: existing.id,
      token: existing.token,
      tokenExpiresAt: existing.tokenExpiresAt,
      surveyUrl: url,
      questions: existing.questionsPlan as QuestionPlan[],
      message,
      alreadyPrepared: !!existing.sentAt,
    };
  }

  const token = signSurveyToken(candidate.bookingId, tokenExpiresAtMs);
  const url = `${baseUrl.replace(/\/$/, '')}/s/${token}`;
  const message = buildMessage({
    language: candidate.language,
    guestFirstName: candidate.guestFirstName ?? candidate.guestFullName.split(/\s+/)[0] ?? '',
    hostName: candidate.hostName,
    propertyName: candidate.propertyName,
    url,
  });

  let quizId: string;
  if (existing) {
    await db
      .update(guestQuizzes)
      .set({
        token,
        tokenExpiresAt,
        questionsPlan: plan,
        language: candidate.language,
      })
      .where(eq(guestQuizzes.id, existing.id));
    quizId = existing.id;
  } else {
    const [inserted] = await db
      .insert(guestQuizzes)
      .values({
        bookingId: candidate.bookingId,
        token,
        tokenExpiresAt,
        questionsPlan: plan,
        language: candidate.language,
        questions: [],
      })
      .returning({ id: guestQuizzes.id });
    if (!inserted) throw new Error('prepareSurveySend: insert returned no row');
    quizId = inserted.id;
  }

  return {
    quizId,
    token,
    tokenExpiresAt,
    surveyUrl: url,
    questions: plan,
    message,
    alreadyPrepared: false,
  };
}

/**
 * Marca il sondaggio come inviato all'ospite.
 *
 * providerMessageId e' OBBLIGATORIO e non nullo: e' la prova che il
 * link e' partito davvero (Andrea, 05/08).
 *
 * PERCHE'. Prima bastava (db, quizId). Col kill switch attivo sendText
 * non inviava, il chiamante non guardava l'esito, e questa funzione
 * scriveva sent_at: al giro successivo prepareSurveySend trovava
 * alreadyPrepared e rispondeva 'already_sent'. Il sondaggio spariva
 * per sempre, anche dopo aver abbassato lo switch.
 *
 * Stesso modello di setKitSetupComplete, che senza photoUrl non si
 * puo' chiamare: la prova entra nel tipo, non resta un'assunzione.
 */
export async function markSurveySent(
  db: Database,
  quizId: string,
  providerMessageId: string,
): Promise<void> {
  if (!providerMessageId) {
    throw new Error(
      '[markSurveySent] providerMessageId vuoto: non e una prova di invio. ' +
        'Se il link non e partito, non marcare il sondaggio come inviato.',
    );
  }
  await db.update(guestQuizzes).set({ sentAt: new Date() }).where(eq(guestQuizzes.id, quizId));
}

export type LoadedSurvey = {
  quizId: string;
  bookingId: string;
  guestFirstName: string;
  hostName: string;
  propertyName: string;
  language: 'it' | 'en';
  questions: QuestionPlan[];
  responses: Record<string, SurveyResponse> | null;
  alreadySubmitted: boolean;
  expired: boolean;
};

export type LoadResult =
  | { ok: true; survey: LoadedSurvey }
  | { ok: false; reason: 'invalid' | 'expired' | 'not_found' };

export async function loadSurveyByToken(db: Database, token: string): Promise<LoadResult> {
  const verified = verifySurveyToken(token);
  if (!verified.ok) {
    return { ok: false, reason: verified.reason === 'expired' ? 'expired' : 'invalid' };
  }

  const [row] = await db
    .select({
      id: guestQuizzes.id,
      bookingId: guestQuizzes.bookingId,
      sentAt: guestQuizzes.sentAt,
      completedAt: guestQuizzes.completedAt,
      skippedAt: guestQuizzes.skippedAt,
      tokenExpiresAt: guestQuizzes.tokenExpiresAt,
      questionsPlan: guestQuizzes.questionsPlan,
      responses: guestQuizzes.responses,
      language: guestQuizzes.language,
      guestFirstName: bookings.guestFirstName,
      guestFullName: bookings.guestFullName,
      hostFullName: hosts.fullName,
      propertyName: properties.name,
    })
    .from(guestQuizzes)
    .innerJoin(bookings, eq(guestQuizzes.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .innerJoin(hosts, eq(properties.hostId, hosts.id))
    .where(eq(guestQuizzes.token, token))
    .limit(1);
  if (!row) return { ok: false, reason: 'not_found' };

  const expired = row.tokenExpiresAt && row.tokenExpiresAt < new Date();
  if (expired && !row.completedAt) return { ok: false, reason: 'expired' };

  return {
    ok: true,
    survey: {
      quizId: row.id,
      bookingId: row.bookingId,
      guestFirstName: row.guestFirstName ?? row.guestFullName.split(/\s+/)[0] ?? 'gentile ospite',
      hostName: row.hostFullName ?? 'host',
      propertyName: row.propertyName,
      language: row.language as 'it' | 'en',
      questions: row.questionsPlan as QuestionPlan[],
      responses: row.responses as Record<string, SurveyResponse> | null,
      alreadySubmitted: !!row.completedAt,
      expired: false,
    },
  };
}

// Track open: incrementa url_opens + first_opened_at se prima volta.
export async function trackSurveyOpen(db: Database, quizId: string): Promise<void> {
  const [row] = await db
    .select({ urlOpens: guestQuizzes.urlOpens, firstOpenedAt: guestQuizzes.firstOpenedAt })
    .from(guestQuizzes)
    .where(eq(guestQuizzes.id, quizId))
    .limit(1);
  if (!row) return;
  await db
    .update(guestQuizzes)
    .set({
      urlOpens: row.urlOpens + 1,
      firstOpenedAt: row.firstOpenedAt ?? new Date(),
    })
    .where(eq(guestQuizzes.id, quizId));
}

export type SubmitResult =
  | { ok: true; alreadySubmitted: boolean; bookingId: string }
  | { ok: false; reason: 'invalid_token' | 'expired' | 'not_found' };

export async function submitSurvey(
  db: Database,
  token: string,
  responses: Record<string, SurveyResponse>,
): Promise<SubmitResult> {
  const verified = verifySurveyToken(token);
  if (!verified.ok) {
    return { ok: false, reason: verified.reason === 'expired' ? 'expired' : 'invalid_token' };
  }

  const [row] = await db
    .select({
      id: guestQuizzes.id,
      bookingId: guestQuizzes.bookingId,
      completedAt: guestQuizzes.completedAt,
      tokenExpiresAt: guestQuizzes.tokenExpiresAt,
    })
    .from(guestQuizzes)
    .where(eq(guestQuizzes.token, token))
    .limit(1);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.completedAt) {
    return { ok: true, alreadySubmitted: true, bookingId: row.bookingId };
  }
  if (row.tokenExpiresAt && row.tokenExpiresAt < new Date()) {
    return { ok: false, reason: 'expired' };
  }

  await db
    .update(guestQuizzes)
    .set({
      completedAt: new Date(),
      responses,
    })
    .where(eq(guestQuizzes.id, row.id));
  return { ok: true, alreadySubmitted: false, bookingId: row.bookingId };
}

// Cron timeout 96h.
export type StaleSurvey = {
  quizId: string;
  bookingId: string;
  hoursSinceSent: number;
};

export async function findStaleSurveys(
  db: Database,
  now: Date = new Date(),
): Promise<StaleSurvey[]> {
  const cutoff = new Date(now.getTime() - ABANDON_AFTER_HOURS * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: guestQuizzes.id,
      bookingId: guestQuizzes.bookingId,
      sentAt: guestQuizzes.sentAt,
      completedAt: guestQuizzes.completedAt,
      skippedAt: guestQuizzes.skippedAt,
    })
    .from(guestQuizzes)
    .where(lte(guestQuizzes.sentAt, cutoff));
  return rows
    .filter((r) => r.sentAt && !r.completedAt && !r.skippedAt)
    .map((r) => ({
      quizId: r.id,
      bookingId: r.bookingId,
      hoursSinceSent: r.sentAt ? (now.getTime() - r.sentAt.getTime()) / (60 * 60 * 1000) : 0,
    }));
}

export async function markSurveyAbandoned(db: Database, quizId: string): Promise<void> {
  await db
    .update(guestQuizzes)
    .set({ skippedAt: new Date(), skippedReason: 'no_response_96h' })
    .where(eq(guestQuizzes.id, quizId));
}

// ─── Helpers ──────────────────────────────────────────────────

async function buildPlannerContext(
  db: Database,
  bookingId: string,
): Promise<SurveyPlannerContext | null> {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      guestFirstName: bookings.guestFirstName,
      guestFullName: bookings.guestFullName,
      guestCountryCode: bookings.guestCountryCode,
      guestLanguage: bookings.guestLanguage,
      numAdults: bookings.numAdults,
      numChildren: bookings.numChildren,
      nights: bookings.nights,
      guestMessageOriginal: bookings.guestMessageOriginal,
      propertyName: properties.name,
      propertyCity: properties.city,
      hostFullName: hosts.fullName,
    })
    .from(bookings)
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .innerJoin(hosts, eq(properties.hostId, hosts.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return null;
  return {
    booking: {
      id: row.bookingId,
      guestFirstName: row.guestFirstName,
      guestFullName: row.guestFullName,
      guestCountryCode: row.guestCountryCode,
      guestLanguage: row.guestLanguage,
      numAdults: row.numAdults,
      numChildren: row.numChildren,
      nights: row.nights,
      guestMessageOriginal: row.guestMessageOriginal,
    },
    property: {
      name: row.propertyName,
      city: row.propertyCity ?? '',
    },
    host: {
      fullName: row.hostFullName,
    },
  };
}

function fallbackCtx(candidate: SurveySendCandidate): SurveyPlannerContext {
  return {
    booking: {
      id: candidate.bookingId,
      guestFirstName: candidate.guestFirstName,
      guestFullName: candidate.guestFullName,
      guestCountryCode: null,
      guestLanguage: candidate.language,
      numAdults: 1,
      numChildren: 0,
      nights: 3,
      guestMessageOriginal: null,
    },
    property: { name: candidate.propertyName, city: '' },
    host: { fullName: candidate.hostName },
  };
}

export function buildMessage(input: {
  language: 'it' | 'en';
  guestFirstName: string;
  hostName: string;
  propertyName: string;
  url: string;
}): string {
  const fname = input.guestFirstName;
  if (input.language === 'en') {
    return `Hi ${fname} 👋 I'm Premura, ${input.hostName}'s assistant for ${input.propertyName}.\n\nWe'd like to make the apartment perfect for you. Just 3 quick taps (1 minute, no typing):\n\n👉 ${input.url}\n\nSee you soon!`;
  }
  return `Ciao ${fname} 👋 Sono Premura, l'assistente di ${input.hostName} per ${input.propertyName}.\n\nPer prepararti la casa al meglio, 3 domandine veloci (1 minuto, niente da scrivere):\n\n👉 ${input.url}\n\nA presto!`;
}

function pickLanguage(guestLanguage: string | null, countryCode: string | null): 'it' | 'en' {
  if (guestLanguage === 'it' || guestLanguage === 'en') return guestLanguage;
  if (guestLanguage?.startsWith('it')) return 'it';
  if (countryCode === 'IT') return 'it';
  return 'en';
}
