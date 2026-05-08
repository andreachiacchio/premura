import { describe, expect, it } from 'vitest';
import { buildMessage } from '../src/survey-pipeline';

// Slice B — Test pure functions pipeline (template messaggio).

describe('buildMessage', () => {
  it('IT: include first_name + host + property + URL', () => {
    const m = buildMessage({
      language: 'it',
      guestFirstName: 'Mario',
      hostName: 'Andrea',
      propertyName: 'La Goccia',
      url: 'https://premura.it/s/abc.def.ghi',
    });
    expect(m).toContain('Mario');
    expect(m).toContain('Andrea');
    expect(m).toContain('La Goccia');
    expect(m).toContain('https://premura.it/s/abc.def.ghi');
    expect(m).toContain('Premura');
    expect(m).toContain('1 minuto');
  });

  it('EN: traduzione idiomatica', () => {
    const m = buildMessage({
      language: 'en',
      guestFirstName: 'Sara',
      hostName: 'Andrea',
      propertyName: 'La Goccia',
      url: 'https://premura.it/s/xyz',
    });
    expect(m).toContain('Sara');
    expect(m).toContain("Andrea's assistant");
    expect(m).toContain('https://premura.it/s/xyz');
    expect(m).toContain('1 minute');
    expect(m).not.toContain('Ciao');
  });

  it('messaggio rimane sotto 800 chars (WA template safe)', () => {
    const m = buildMessage({
      language: 'it',
      guestFirstName: 'GuestNameMolto Lungo Lungo',
      hostName: 'Host Name Lungo',
      propertyName: 'Property Name Molto Molto Lungo Per Test',
      url: 'https://premura.it/s/' + 'a'.repeat(300),
    });
    expect(m.length).toBeLessThan(800);
  });
});
