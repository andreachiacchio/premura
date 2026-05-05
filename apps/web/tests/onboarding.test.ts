import type { Database } from '@premura/db';
import { describe, expect, it, vi } from 'vitest';
import {
  ONBOARDING_STEPS,
  type OnboardingStep,
  getOnboardingState,
  nextStep,
  urlForStep,
} from '../lib/onboarding';

describe('ONBOARDING_STEPS', () => {
  it('ordine atteso 4 step pre-completed', () => {
    expect(ONBOARDING_STEPS).toEqual(['welcome', 'property', 'gmail', 'whatsapp']);
  });
});

describe('urlForStep', () => {
  it('completed -> /dashboard', () => {
    expect(urlForStep('completed')).toBe('/dashboard');
  });

  it.each(['welcome', 'property', 'gmail', 'whatsapp'] as OnboardingStep[])(
    '%s -> /onboarding/%s',
    (step) => {
      expect(urlForStep(step)).toBe(`/onboarding/${step}`);
    },
  );
});

describe('nextStep', () => {
  it.each([
    ['welcome', 'property'],
    ['property', 'gmail'],
    ['gmail', 'whatsapp'],
    ['whatsapp', 'completed'],
    ['completed', 'completed'],
  ] as const)('%s -> %s', (current, expected) => {
    expect(nextStep(current as OnboardingStep)).toBe(expected);
  });
});

describe('getOnboardingState', () => {
  function makeMockDb(row: { step: string; completed: boolean } | null): Database {
    const mock = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(row ? [row] : []),
          }),
        }),
      }),
    };
    return mock as unknown as Database;
  }

  it('host non trovato -> default welcome non completed', async () => {
    const db = makeMockDb(null);
    const state = await getOnboardingState(db, 'host-x');
    expect(state).toEqual({ step: 'welcome', completed: false });
  });

  it('host con step e completed=false -> ritorna step corrente', async () => {
    const db = makeMockDb({ step: 'property', completed: false });
    const state = await getOnboardingState(db, 'host-1');
    expect(state).toEqual({ step: 'property', completed: false });
  });

  it('host completed -> step=completed', async () => {
    const db = makeMockDb({ step: 'completed', completed: true });
    const state = await getOnboardingState(db, 'host-1');
    expect(state).toEqual({ step: 'completed', completed: true });
  });

  it('step DB invalido -> normalizzato a welcome', async () => {
    const db = makeMockDb({ step: 'unknown-junk', completed: false });
    const state = await getOnboardingState(db, 'host-1');
    expect(state.step).toBe('welcome');
  });
});
