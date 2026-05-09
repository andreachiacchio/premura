import { describe, expect, it } from 'vitest';
import { type SurveyPlannerContext, fallbackPlan } from '../src/survey-planner';

// Slice B — Test fallback planner (smoke deterministic, no LLM).

function makeCtx(overrides: Partial<SurveyPlannerContext['booking']> = {}): SurveyPlannerContext {
  return {
    booking: {
      id: 'b1',
      guestFirstName: 'Mario',
      guestFullName: 'Mario Rossi',
      guestCountryCode: 'IT',
      guestLanguage: 'it',
      numAdults: 2,
      numChildren: 0,
      nights: 3,
      guestMessageOriginal: null,
      ...overrides,
    },
    property: { name: 'La Goccia', city: 'Napoli' },
    host: { fullName: 'Andrea' },
  };
}

describe('fallbackPlan', () => {
  it('soggiorno 1 notte -> 2 questions', () => {
    const r = fallbackPlan(makeCtx({ nights: 1 }));
    expect(r.questions).toHaveLength(2);
  });

  it('soggiorno 3 notti -> 3 questions', () => {
    const r = fallbackPlan(makeCtx({ nights: 3 }));
    expect(r.questions).toHaveLength(3);
  });

  it('soggiorno 7 notti -> 4 questions', () => {
    const r = fallbackPlan(makeCtx({ nights: 7 }));
    expect(r.questions).toHaveLength(4);
  });

  it('ogni question ha id, prompt IT/EN, options', () => {
    const r = fallbackPlan(makeCtx({ nights: 4 }));
    for (const q of r.questions) {
      expect(q.id).toBeTruthy();
      expect(q.prompt_it.length).toBeGreaterThan(0);
      expect(q.prompt_en.length).toBeGreaterThan(0);
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      for (const opt of q.options) {
        expect(opt.value).toBeTruthy();
        expect(opt.emoji).toBeTruthy();
        expect(opt.label_it).toBeTruthy();
        expect(opt.label_en).toBeTruthy();
      }
    }
  });

  it('domanda allergies ha opzione "other" con allow_text', () => {
    const r = fallbackPlan(makeCtx({ nights: 4 }));
    const allergies = r.questions.find((q) => q.id === 'allergies');
    expect(allergies).toBeDefined();
    const otherOpt = allergies?.options.find((o) => o.value === 'other');
    expect(otherOpt?.allow_text).toBe(true);
  });
});
