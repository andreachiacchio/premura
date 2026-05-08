import { describe, expect, it, vi } from 'vitest';
import { buildFirstMessage, buildNudgeMessage } from '../src/survey-pipeline';

// Slice B — Test smoke pipeline survey.
// I path principali (cron candidates, processSurveyInbound) richiedono
// mock Drizzle complessi e mock Anthropic. Qui copriamo le funzioni
// pure: template messaggi.

describe('buildFirstMessage', () => {
  it('IT: include first_name + host_name + property_name', () => {
    const m = buildFirstMessage({
      language: 'it',
      guestFirstName: 'Mario',
      hostName: 'Andrea',
      propertyName: 'La Goccia',
    });
    expect(m).toContain('Mario');
    expect(m).toContain('Andrea');
    expect(m).toContain('La Goccia');
    expect(m).toContain('Premura');
    expect(m.length).toBeLessThan(800);
  });

  it('EN: traduce, no concetto literal', () => {
    const m = buildFirstMessage({
      language: 'en',
      guestFirstName: 'Sara',
      hostName: 'Andrea',
      propertyName: 'La Goccia',
    });
    expect(m).toContain('Sara');
    expect(m).toContain("Andrea's assistant");
    expect(m).toContain('La Goccia');
    expect(m).not.toContain('Ciao');
    expect(m.length).toBeLessThan(800);
  });
});

describe('buildNudgeMessage', () => {
  it('IT: tone "no pressure"', () => {
    const m = buildNudgeMessage({ language: 'it', guestFirstName: 'Mario' });
    expect(m).toContain('Mario');
    expect(m.toLowerCase()).toContain('fretta');
  });

  it('EN: "no pressure" idiom', () => {
    const m = buildNudgeMessage({ language: 'en', guestFirstName: 'Sara' });
    expect(m).toContain('Sara');
    expect(m.toLowerCase()).toContain('no pressure');
  });
});
