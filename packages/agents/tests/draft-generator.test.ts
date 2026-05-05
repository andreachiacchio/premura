import { describe, expect, it } from 'vitest';
import {
  CLASSIFICATION_VALUES,
  type DraftOutput,
  type GenerateDraftInput,
  buildUserContent,
  decideRouting,
} from '../src/draft-generator';

// Test prompt builder + decisore routing (slice 11). Niente mock
// Anthropic: la generateReplyDraft vera viene testata via pipeline
// integration tests.

const baseInput = (overrides: Partial<GenerateDraftInput> = {}): GenerateDraftInput => ({
  conversation: [
    {
      direction: 'inbound',
      fromEntity: 'guest',
      body: 'Ciao, dove sono le chiavi?',
    },
  ],
  voiceProfile: null,
  guestInsights: null,
  propertyKnowledge: null,
  propertyName: 'La Goccia',
  ...overrides,
});

describe('CLASSIFICATION_VALUES', () => {
  it('include i 6 valori canonici', () => {
    expect(CLASSIFICATION_VALUES).toEqual([
      'info_request',
      'complaint',
      'small_talk',
      'emergency',
      'booking_question',
      'other',
    ]);
  });
});

describe('buildUserContent - struttura prompt', () => {
  it('include nome struttura + ospite', () => {
    const content = buildUserContent(baseInput({ guestFirstName: 'Mario' }));
    expect(content).toContain('STRUTTURA: La Goccia');
    expect(content).toContain('OSPITE: Mario');
  });

  it('voice profile assente -> fallback "tono neutro"', () => {
    const content = buildUserContent(baseInput({ voiceProfile: null }));
    expect(content).toContain('VOICE PROFILE HOST: non ancora estratto');
  });

  it('voice profile basso confidence (<0.1) -> fallback', () => {
    const content = buildUserContent(
      baseInput({
        voiceProfile: {
          formalityScore: 4,
          voiceConfidence: 0.05,
        },
      }),
    );
    expect(content).toContain('VOICE PROFILE HOST: non ancora estratto');
  });

  it('voice profile robusto -> include feature', () => {
    const content = buildUserContent(
      baseInput({
        voiceProfile: {
          avgSentenceLength: 12.5,
          formalityScore: 4.2,
          emojiUsageRate: 0.6,
          commonPhrases: [
            { phrase: 'fammi sapere', count: 8 },
            { phrase: 'a presto', count: 3 },
          ],
          greetingPatterns: ['Ciao!', 'Buongiorno'],
          closingPatterns: ['— Andrea'],
          voiceConfidence: 0.7,
        },
      }),
    );
    expect(content).toContain('formality_score: 4.20 (casual)');
    expect(content).toContain('avg_sentence_length: 12.5 parole');
    expect(content).toContain('emoji_usage_rate: 60%');
    expect(content).toContain('"fammi sapere"');
    expect(content).toContain('Ciao!');
    expect(content).toContain('— Andrea');
  });

  it('property knowledge presente -> include keybox + wifi + parking + regole', () => {
    const content = buildUserContent(
      baseInput({
        propertyKnowledge: {
          keybox: { code: '1234', instructions: 'sopra al campanello' },
          wifi: { ssid: 'Premura', password: 'topsecret', notes: 'router al piano sotto' },
          parking: { type: 'street', instructions: 'via Roma' },
          houseRules: {
            quietHoursStart: '22:00',
            quietHoursEnd: '08:00',
            smokingAllowed: false,
            petsAllowed: true,
          },
          additionalInfo: 'Termosifoni si accendono dalle 18.',
        },
      }),
    );
    expect(content).toContain('code="1234"');
    expect(content).toContain('ssid="Premura"');
    expect(content).toContain('password="topsecret"');
    expect(content).toContain('parcheggio: tipo=street');
    expect(content).toContain('silenzio 22:00-08:00');
    expect(content).toContain('vietato fumare');
    expect(content).toContain('animali ok');
    expect(content).toContain('Termosifoni si accendono');
  });

  it('property knowledge assente -> notify host', () => {
    const content = buildUserContent(baseInput({ propertyKnowledge: null }));
    expect(content).toContain('non ancora compilata');
    expect(content).toContain('notify_host');
  });

  it('guest DNA insights -> include lingua + sentiment', () => {
    const content = buildUserContent(
      baseInput({
        guestInsights: {
          preferredLanguage: 'en',
          communicationStyle: { score: 4, label: 'casual' },
          topicsMentioned: ['parking', 'wifi'],
          sentimentAvg: 0.4,
        },
      }),
    );
    expect(content).toContain('preferred_language: en');
    expect(content).toContain('communication_style: casual (4/5)');
    expect(content).toContain('parking, wifi');
    expect(content).toContain('sentiment_avg: 0.40');
  });

  it("conversazione: ultimo elemento e' messaggio inbound da rispondere", () => {
    const content = buildUserContent(
      baseInput({
        conversation: [
          { direction: 'outbound', fromEntity: 'host', body: 'Ciao, benvenuto!' },
          { direction: 'inbound', fromEntity: 'guest', body: 'Grazie. A che ora il check-in?' },
        ],
      }),
    );
    expect(content).toContain('CONVERSAZIONE');
    expect(content).toContain('Ciao, benvenuto!');
    expect(content).toContain('A che ora il check-in?');
    // Order check: host viene prima dell'ultima inbound.
    const idxHost = content.indexOf('Ciao, benvenuto');
    const idxLast = content.indexOf('A che ora il check-in');
    expect(idxHost).toBeLessThan(idxLast);
  });
});

describe('decideRouting - smart routing', () => {
  const draft = (overrides: Partial<DraftOutput> = {}): DraftOutput => ({
    draft_body: 'risposta',
    confidence: 0.9,
    reasoning: 'r',
    classification: 'info_request',
    suggested_action: 'auto_send',
    ...overrides,
  });

  it('emergency -> escalate sempre, anche se confidence alta', () => {
    expect(
      decideRouting(draft({ classification: 'emergency', confidence: 0.95 }), {
        waChannelLive: true,
      }),
    ).toBe('escalate');
  });

  it('confidence > 0.85 + info_request + WA live -> auto_send', () => {
    expect(
      decideRouting(draft({ confidence: 0.9, classification: 'info_request' }), {
        waChannelLive: true,
      }),
    ).toBe('auto_send');
  });

  it('confidence > 0.85 + small_talk + WA live -> auto_send', () => {
    expect(
      decideRouting(draft({ confidence: 0.9, classification: 'small_talk' }), {
        waChannelLive: true,
      }),
    ).toBe('auto_send');
  });

  it('confidence > 0.85 + WA NON live -> notify_host', () => {
    expect(
      decideRouting(draft({ confidence: 0.95, classification: 'info_request' }), {
        waChannelLive: false,
      }),
    ).toBe('notify_host');
  });

  it('confidence < 0.85 -> notify_host', () => {
    expect(
      decideRouting(draft({ confidence: 0.7, classification: 'info_request' }), {
        waChannelLive: true,
      }),
    ).toBe('notify_host');
  });

  it('complaint -> notify_host (sempre)', () => {
    expect(
      decideRouting(draft({ confidence: 0.9, classification: 'complaint' }), {
        waChannelLive: true,
      }),
    ).toBe('notify_host');
  });

  it('booking_question -> notify_host (sempre)', () => {
    expect(
      decideRouting(draft({ confidence: 0.9, classification: 'booking_question' }), {
        waChannelLive: true,
      }),
    ).toBe('notify_host');
  });

  it('other -> notify_host', () => {
    expect(
      decideRouting(draft({ confidence: 0.9, classification: 'other' }), {
        waChannelLive: true,
      }),
    ).toBe('notify_host');
  });
});
