import { ONBOARDING_STEPS, type OnboardingStep } from '@/lib/onboarding';
import type { ReactNode } from 'react';

// Layout wrapper per tutte le pagine onboarding. Stepper visivo in alto
// + content centrato. Mobile-first, palette Premura.

export function OnboardingShell({
  step,
  title,
  subtitle,
  children,
}: {
  step: OnboardingStep;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory px-5 py-8">
      <Stepper step={step} />
      <header className="mt-6">
        <h1 className="font-fraunces text-[28px] font-semibold leading-tight text-blu-deep">
          {title}
        </h1>
        {subtitle ? <p className="mt-2 text-body text-blu-deep/70">{subtitle}</p> : null}
      </header>
      <section className="mt-6">{children}</section>
    </main>
  );
}

function Stepper({ step }: { step: OnboardingStep }) {
  const currentIdx = ONBOARDING_STEPS.indexOf(step as (typeof ONBOARDING_STEPS)[number]);
  return (
    <div className="flex items-center gap-2">
      {ONBOARDING_STEPS.map((s, i) => {
        const isActive = i === currentIdx;
        const isPast = currentIdx > i;
        const bg = isActive ? 'bg-terracotta' : isPast ? 'bg-terracotta/60' : 'bg-blu-deep/15';
        return (
          <div key={s} aria-label={`step-${s}`} className={`h-1.5 flex-1 rounded-full ${bg}`} />
        );
      })}
    </div>
  );
}
