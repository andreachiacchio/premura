import { type Database, hosts } from '@premura/db';
import { eq } from 'drizzle-orm';

// Slice 9 prep: helpers onboarding stepper multi-host.
// Slice H (V1 block self-service): step ridefiniti per coprire flow
// completo onboarding (welcome → property → calendar → knowledge →
// cleaner → completed). Step "gmail" / "whatsapp" deprecati ma
// accettati per back-compat (host esistenti pre-slice-H restano nel
// loro step finché non avanzano).
//
// Step ordinati. resume capability: dato uno stato corrente, si calcola
// la pagina target. Una volta completed, redirect a /dashboard.

export const ONBOARDING_STEPS = [
  'welcome',
  'property',
  'calendar',
  'knowledge',
  'cleaner',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number] | 'completed';

// Step legacy back-compat (host pre-slice-H). Mappati allo step "equivalente"
// nel nuovo flow.
const LEGACY_STEP_MAP: Record<string, OnboardingStep> = {
  gmail: 'calendar',
  whatsapp: 'cleaner',
};

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
  // Map legacy step → nuovo step equivalente.
  const allowed = new Set<string>([...ONBOARDING_STEPS, 'completed']);
  let stepValue: string = row.step ?? 'welcome';
  if (!allowed.has(stepValue)) {
    stepValue = LEGACY_STEP_MAP[stepValue] ?? 'welcome';
  }
  return { step: stepValue as OnboardingStep, completed: row.completed };
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

// Step seguente. 'cleaner' -> 'completed'.
export function nextStep(step: OnboardingStep): OnboardingStep {
  const idx = ONBOARDING_STEPS.indexOf(step as (typeof ONBOARDING_STEPS)[number]);
  if (idx === -1 || idx === ONBOARDING_STEPS.length - 1) return 'completed';
  return ONBOARDING_STEPS[idx + 1] as OnboardingStep;
}
