import { type Database, hosts } from '@premura/db';
import { eq } from 'drizzle-orm';

// Slice 9 prep: helpers onboarding stepper multi-host.
//
// Step ordinati. resume capability: dato uno stato corrente, si calcola
// la pagina target. Una volta completed, redirect a /dashboard.

export const ONBOARDING_STEPS = ['welcome', 'property', 'gmail', 'whatsapp'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number] | 'completed';

export type OnboardingState = {
  step: OnboardingStep;
  completed: boolean;
};

export async function getOnboardingState(db: Database, hostId: string): Promise<OnboardingState> {
  const [row] = await db
    .select({
      step: hosts.onboardingStep,
      completed: hosts.onboardingCompleted,
    })
    .from(hosts)
    .where(eq(hosts.id, hostId))
    .limit(1);

  if (!row) {
    return { step: 'welcome', completed: false };
  }

  // Validazione runtime: il DB ha varchar libero, normalizziamo a enum.
  const allowed = new Set<string>([...ONBOARDING_STEPS, 'completed']);
  const step = (allowed.has(row.step) ? row.step : 'welcome') as OnboardingStep;
  return { step, completed: row.completed };
}

export async function setOnboardingStep(
  db: Database,
  hostId: string,
  step: OnboardingStep,
): Promise<void> {
  await db.update(hosts).set({ onboardingStep: step }).where(eq(hosts.id, hostId));
}

export async function completeOnboarding(db: Database, hostId: string): Promise<void> {
  await db
    .update(hosts)
    .set({
      onboardingCompleted: true,
      onboardingCompletedAt: new Date(),
      onboardingStep: 'completed',
    })
    .where(eq(hosts.id, hostId));
}

export async function setHostInfo(
  db: Database,
  hostId: string,
  info: { fullName: string; locale: 'it-IT' | 'en-US' },
): Promise<void> {
  await db
    .update(hosts)
    .set({ fullName: info.fullName, locale: info.locale })
    .where(eq(hosts.id, hostId));
}

// Url della pagina onboarding per uno step. Usata dal middleware redirect.
export function urlForStep(step: OnboardingStep): string {
  if (step === 'completed') return '/dashboard';
  return `/onboarding/${step}`;
}

// Step seguente. 'whatsapp' -> 'completed'.
export function nextStep(step: OnboardingStep): OnboardingStep {
  const idx = ONBOARDING_STEPS.indexOf(step as (typeof ONBOARDING_STEPS)[number]);
  if (idx === -1 || idx === ONBOARDING_STEPS.length - 1) return 'completed';
  return ONBOARDING_STEPS[idx + 1] as OnboardingStep;
}
