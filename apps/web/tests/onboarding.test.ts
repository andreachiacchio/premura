import type { Database } from '@premura/db';
import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_STEPS,
  type OnboardingStep,
  getOnboardingState,
  nextStep,
  urlForStep,
} from '../lib/onboarding';

describe('ONBOARDING_STEPS', () => {
  it('Slice H: ordine atteso 5 step pre-completed', () => {
    expect(ONBOARDING_STEPS).toEqual(['welcome', 'property', 'calendar', 'knowledge', 'cleaner']);
  });
});

describe('urlForStep', () => {
  it('completed -> /dashboard', () => {
    expect(urlForStep('completed')).toBe('/dashboard');
  });

  it.each(['welcome', 'property', 'calendar', 'knowledge', 'cleaner'] as OnboardingStep[])(
    '%s -> /onboarding/%s',
    (step) => {
      expect(urlForStep(step)).toBe(`/onboarding/${step}`);
    },
  );
});

describe('nextStep', () => {
  it.each([
    ['welcome', 'property'],
    ['property', 'calendar'],
    ['calendar', 'knowledge'],
    ['knowledge', 'cleaner'],
    ['cleaner', 'completed'],
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

  it('legacy step "gmail" -> mappato a calendar (Slice H back-compat)', async () => {
    const db = makeMockDb({ step: 'gmail', completed: false });
    const state = await getOnboardingState(db, 'host-1');
    expect(state.step).toBe('calendar');
  });

  it('legacy step "whatsapp" -> mappato a cleaner', async () => {
    const db = makeMockDb({ step: 'whatsapp', completed: false });
    const state = await getOnboardingState(db, 'host-1');
    expect(state.step).toBe('cleaner');
  });
});
