import { ONBOARDING_STEPS, type OnboardingStep } from '@/lib/onboarding';
import type { ReactNode } from 'react';

// Slice 10a — layout wrapper Premura per tutte le pagine onboarding.
// Background ivory, header serif Fraunces, body sans Inter.
// Stepper visivo terracotta che progredisce.

export function OnboardingShell({
  step,
  title,
  subtitle,
  children,
}: {
  step: OnboardingStep;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory px-5 pt-12 pb-10">
      <Stepper step={step} />
      <header className="mt-10">
        <h1 className="font-serif text-h1 leading-[1.05] tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-4 text-body-lg text-ink-soft">{subtitle}</p> : null}
      </header>
      <section className="mt-8">{children}</section>
    </main>
  );
}

function Stepper({ step }: { step: OnboardingStep }) {
  const currentIdx = ONBOARDING_STEPS.indexOf(step as (typeof ONBOARDING_STEPS)[number]);
  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={`Step ${currentIdx + 1} di ${ONBOARDING_STEPS.length}`}
    >
      {ONBOARDING_STEPS.map((s, i) => {
        const isActive = i === currentIdx;
        const isPast = currentIdx > i;
        const bg = isActive ? 'bg-terracotta' : isPast ? 'bg-terracotta/60' : 'bg-line';
        return <div key={s} aria-label={`step-${s}`} className={`h-1 flex-1 rounded-full ${bg}`} />;
      })}
    </div>
  );
}
