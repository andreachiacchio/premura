import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BEFORE importing the module under test
vi.mock('@premura/shared', () => ({
  runClaude: vi.fn(),
}));

import { runClaude } from '@premura/shared';
import { generateGuestDna } from '@premura/agents';

describe('generateGuestDna', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses valid tool output from Claude', async () => {
    vi.mocked(runClaude).mockResolvedValueOnce({
      text: '',
      toolUses: [
        {
          name: 'emit_guest_dna',
          input: {
            archetype: 'Coppia romantica prima volta a Napoli',
            archetypeDescription:
              'Coppia olandese, 30 anni, weekend breve. Prima volta in città, alto interesse per cucina locale.',
            signals: {
              tone: 'formal_warm',
              travelPurpose: 'romantic',
              firstTimeInCity: true,
              languagePrimary: 'it',
            },
            risks: [
              {
                code: 'noise_sensitivity',
                title: 'Rumore notturno centro storico',
                level: 'high',
                mitigation: 'Tappi per orecchie + messaggio framing sul carattere del quartiere',
              },
            ],
            confidence: 0.82,
            reasoning: 'Weekend breve + prezzo medio + paese olandese = pattern sensibile al rumore',
          },
        },
      ],
      model: 'claude-opus-4-7',
      costUsd: 0.012,
      raw: {} as never,
    });

    const out = await generateGuestDna({
      guest: { fullName: 'Anna van Dijsseldonk', countryCode: 'NL' },
      booking: {
        platform: 'booking',
        checkinAt: new Date('2026-05-01T15:00:00Z'),
        checkoutAt: new Date('2026-05-03T11:00:00Z'),
        nights: 2,
        numAdults: 2,
        numChildren: 0,
        totalPriceEur: 240,
      },
      property: { name: 'La goccia di S.Gennaro', city: 'Napoli' },
    });

    expect(out.archetype).toBe('Coppia romantica prima volta a Napoli');
    expect(out.confidence).toBe(0.82);
    expect(out.risks).toHaveLength(1);
    expect(out.risks[0]?.code).toBe('noise_sensitivity');
    expect(out.costUsd).toBeCloseTo(0.012);
  });

  it('throws when Claude does not emit the tool', async () => {
    vi.mocked(runClaude).mockResolvedValueOnce({
      text: 'Ehi ciao non ho usato il tool',
      toolUses: [],
      model: 'claude-opus-4-7',
      costUsd: 0.001,
      raw: {} as never,
    });

    await expect(
      generateGuestDna({
        guest: { fullName: 'Test' },
        booking: {
          platform: 'booking',
          checkinAt: new Date(),
          checkoutAt: new Date(),
          nights: 1,
          numAdults: 1,
          numChildren: 0,
        },
        property: { name: 'Test', city: 'Napoli' },
      }),
    ).rejects.toThrow(/did not emit/);
  });

  it('validates confidence is in 0..1 range', async () => {
    vi.mocked(runClaude).mockResolvedValueOnce({
      text: '',
      toolUses: [
        {
          name: 'emit_guest_dna',
          input: {
            archetype: 'X',
            archetypeDescription: 'x'.repeat(25),
            signals: {},
            risks: [{ code: 'x', title: 'x', level: 'low', mitigation: 'x' }],
            confidence: 1.5, // invalid
            reasoning: 'x',
          },
        },
      ],
      model: 'claude-opus-4-7',
      costUsd: 0,
      raw: {} as never,
    });

    await expect(
      generateGuestDna({
        guest: { fullName: 'Test' },
        booking: {
          platform: 'booking',
          checkinAt: new Date(),
          checkoutAt: new Date(),
          nights: 1,
          numAdults: 1,
          numChildren: 0,
        },
        property: { name: 'Test', city: 'Napoli' },
      }),
    ).rejects.toThrow();
  });
});
