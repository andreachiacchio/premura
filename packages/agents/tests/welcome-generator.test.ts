import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @anthropic-ai/sdk BEFORE importing the module under test.
// La factory ritorna una classe stub: instance.messages.create e' un vi.fn
// configurabile per ogni test via __setNext.
const createMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    public messages = { create: createMock };
  }
  return { default: FakeAnthropic };
});

import type { WelcomeMessageCandidate } from '../src/welcome-message/welcome-finder';
import {
  type VoiceProfileHints,
  generateWelcomeMessage,
} from '../src/welcome-message/welcome-generator';

// Slice E — Test welcome message generator.
// Coverage: template IT/EN + edge cases + voice profile path (Sonnet mocked).

const baseInput: WelcomeMessageCandidate = {
  kitId: 'kit-1',
  bookingId: 'booking-1',
  hostId: 'host-1',
  hostFullName: 'Andrea Chiacchio',
  hostFirstName: 'Andrea',
  guestFullName: 'Lena Mueller',
  guestFirstName: 'Lena',
  guestPhone: '+39 333 1234567',
  guestLanguage: 'it',
  propertyName: 'La Goccia',
  propertyId: 'prop-1',
  checkinAt: new Date('2026-05-15T14:30:00Z'),
  cleanerPhotoUrl: 'https://example/photo.jpg',
  cardMessage: 'Lena, benvenuta a La Goccia. Buon soggiorno a Napoli. — Andrea',
  cardMessageEn: 'Lena, welcome. Enjoy your stay in Naples. — Andrea',
  keyboxCode: '5821',
};

describe('generateWelcomeMessage template IT', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('include greeting con nome guest + property', async () => {
    const out = await generateWelcomeMessage(baseInput);
    expect(out.language).toBe('it');
    expect(out.source).toBe('template');
    expect(out.text).toContain('Buongiorno Lena');
    expect(out.text).toContain('La Goccia');
    expect(out.text).toContain('Andrea Chiacchio');
    expect(out.text).toContain('benvenuto');
  });

  it('include keybox code se valorizzato', async () => {
    const out = await generateWelcomeMessage(baseInput);
    expect(out.hasKeybox).toBe(true);
    expect(out.text).toContain('codice della keybox è 5821');
  });

  it('omette keybox se null', async () => {
    const out = await generateWelcomeMessage({ ...baseInput, keyboxCode: null });
    expect(out.hasKeybox).toBe(false);
    expect(out.text).not.toContain('keybox');
  });

  it('include card message in italiano', async () => {
    const out = await generateWelcomeMessage(baseInput);
    expect(out.text).toContain('Lena, benvenuta a La Goccia');
  });

  it('firma con host name SENZA via Premura (CONTEXT.md §5)', async () => {
    const out = await generateWelcomeMessage(baseInput);
    expect(out.text).toContain('— Andrea Chiacchio');
    expect(out.text).not.toContain('via Premura');
    expect(out.text).not.toContain('AI assistant');
  });

  it('fallback greeting deriva firstName da guestFullName', async () => {
    const out = await generateWelcomeMessage({
      ...baseInput,
      guestFirstName: null,
      guestFullName: 'Lena Mueller',
    });
    expect(out.text).toContain('Buongiorno Lena');
  });

  it('costo = 0 e modelUsed null per template path', async () => {
    const out = await generateWelcomeMessage(baseInput);
    expect(out.costUsd).toBe(0);
    expect(out.modelUsed).toBeNull();
  });
});

describe('generateWelcomeMessage template EN', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('language en quando guestLanguage=en', async () => {
    const out = await generateWelcomeMessage({ ...baseInput, guestLanguage: 'en' });
    expect(out.language).toBe('en');
    expect(out.text).toContain('Good morning Lena');
    expect(out.text).toContain('La Goccia is ready');
    expect(out.text).toContain('keybox code is 5821');
    expect(out.text).toContain('Lena, welcome');
    expect(out.text).toContain('Have a wonderful stay');
    expect(out.text).toContain('— Andrea Chiacchio');
    expect(out.text).not.toContain('via Premura');
  });

  it('usa cardMessage EN se disponibile', async () => {
    const out = await generateWelcomeMessage({
      ...baseInput,
      guestLanguage: 'en',
      cardMessageEn: 'Custom EN card',
    });
    expect(out.text).toContain('Custom EN card');
  });

  it('fallback su cardMessage IT se EN mancante', async () => {
    const out = await generateWelcomeMessage({
      ...baseInput,
      guestLanguage: 'en',
      cardMessageEn: null,
    });
    expect(out.text).toContain('Lena, benvenuta a La Goccia');
  });
});

describe('generateWelcomeMessage edge cases', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('fallback host name "il tuo host" se hostFullName null', async () => {
    const out = await generateWelcomeMessage({ ...baseInput, hostFullName: null });
    expect(out.text).toContain('il tuo host');
  });

  it("niente card message rende output piu' corto", async () => {
    const out = await generateWelcomeMessage({
      ...baseInput,
      cardMessage: null,
      cardMessageEn: null,
    });
    expect(out.text).not.toContain('«');
  });

  it('voice profile null → template path', async () => {
    const out = await generateWelcomeMessage({ ...baseInput, voiceProfile: null });
    expect(out.source).toBe('template');
  });

  it('voice profile confidence <= 0.6 → template path', async () => {
    const out = await generateWelcomeMessage({
      ...baseInput,
      voiceProfile: lowConfidenceVoice(),
    });
    expect(out.source).toBe('template');
    expect(out.modelUsed).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('generateWelcomeMessage voice-aware (Sonnet 4.6)', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    createMock.mockReset();
    process.env.ANTHROPIC_API_KEY = 'sk-test-fake';
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    } else {
      // biome-ignore lint/performance/noDelete: process.env semantica
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('confidence > 0.6 → chiama Sonnet con voice hints', async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: 'Ciao Lena! Benvenuta a La Goccia ☀️\n\nLa casa ti aspetta. Keybox 5821. Per qualsiasi cosa scrivi qui.\n\n— Andrea',
        },
      ],
      usage: { input_tokens: 320, output_tokens: 80 },
    });
    const out = await generateWelcomeMessage({
      ...baseInput,
      voiceProfile: highConfidenceVoice(),
    });
    expect(out.source).toBe('voice_aware_sonnet');
    expect(out.modelUsed).toMatch(/sonnet/);
    expect(out.costUsd).toBeGreaterThan(0);
    expect(out.text).toContain('Ciao Lena');
    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0]?.[0] as {
      system: Array<{ text: string }>;
      messages: Array<{ content: string }>;
    };
    expect(arg.system[0]?.text).toContain('NON sei un AI assistant');
    expect(arg.system[0]?.text).toContain('NON menzionare Premura');
    expect(arg.messages[0]?.content).toContain('formality: tu');
    expect(arg.messages[0]?.content).toContain('caldo');
    expect(arg.messages[0]?.content).toContain('napoletano');
  });

  it('Sonnet error → fallback al template', async () => {
    createMock.mockRejectedValueOnce(new Error('Anthropic API down'));
    const out = await generateWelcomeMessage({
      ...baseInput,
      voiceProfile: highConfidenceVoice(),
    });
    expect(out.source).toBe('template');
    expect(out.text).toContain('Buongiorno Lena');
  });

  it('senza ANTHROPIC_API_KEY → template path anche con confidence alta', async () => {
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.ANTHROPIC_API_KEY;
    const out = await generateWelcomeMessage({
      ...baseInput,
      voiceProfile: highConfidenceVoice(),
    });
    expect(out.source).toBe('template');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('Sonnet con response vuota → fallback template', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '' }],
      usage: { input_tokens: 200, output_tokens: 0 },
    });
    const out = await generateWelcomeMessage({
      ...baseInput,
      voiceProfile: highConfidenceVoice(),
    });
    expect(out.source).toBe('template');
  });
});

function highConfidenceVoice(): VoiceProfileHints {
  return {
    confidence: 0.85,
    formality: 'tu',
    emojiUsage: 'sparse',
    emojiExamples: ['☀️', '💛'],
    toneKeywords: ['caldo', 'napoletano', 'diretto'],
    signatureStyle: '— Andrea',
    exampleGreetings: ['Ciao!', 'Buongiorno'],
    exampleClosings: ['A presto', 'Un caro saluto'],
    avgMessageLength: 'medium',
  };
}

function lowConfidenceVoice(): VoiceProfileHints {
  return {
    confidence: 0.3,
    formality: 'tu',
    emojiUsage: 'never',
    emojiExamples: [],
    toneKeywords: [],
    signatureStyle: null,
    exampleGreetings: [],
    exampleClosings: [],
    avgMessageLength: 'short',
  };
}
