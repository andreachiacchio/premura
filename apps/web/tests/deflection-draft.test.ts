import { describe, expect, it } from 'vitest';
import { buildDeflectionBody } from '../lib/deflection-draft';

// Test della funzione pura buildDeflectionBody (slice 7a.3).
// Copre lingue supportate (it, en, es, fr, de) + fallback italiano,
// firma struttura, presenza numero WA nel body.

describe('buildDeflectionBody', () => {
  const baseInput = {
    guestFirstName: 'Mario',
    propertyName: 'La Goccia di S.Gennaro',
    hostWaNumber: '+39 351 451 2070',
  };

  it('lingua it -> "Ciao Mario", italiano nel body, firma struttura', () => {
    const body = buildDeflectionBody({ ...baseInput, language: 'it' });
    expect(body.startsWith('Ciao Mario,')).toBe(true);
    expect(body).toContain('chiavi');
    expect(body).toContain('+39 351 451 2070');
    expect(body.endsWith('— La Goccia di S.Gennaro')).toBe(true);
  });

  it('lingua en -> "Hi Mario", inglese, numero WA, firma', () => {
    const body = buildDeflectionBody({ ...baseInput, language: 'en' });
    expect(body.startsWith('Hi Mario,')).toBe(true);
    expect(body).toContain('keys');
    expect(body).toContain('+39 351 451 2070');
    expect(body.endsWith('— La Goccia di S.Gennaro')).toBe(true);
  });

  it('lingua es -> "Hola Mario"', () => {
    const body = buildDeflectionBody({ ...baseInput, language: 'es' });
    expect(body.startsWith('Hola Mario,')).toBe(true);
    expect(body).toContain('llaves');
  });

  it('lingua fr -> "Bonjour Mario"', () => {
    const body = buildDeflectionBody({ ...baseInput, language: 'fr' });
    expect(body.startsWith('Bonjour Mario,')).toBe(true);
    expect(body).toContain('cles');
  });

  it('lingua de -> "Hallo Mario"', () => {
    const body = buildDeflectionBody({ ...baseInput, language: 'de' });
    expect(body.startsWith('Hallo Mario,')).toBe(true);
    expect(body).toContain('Schluessel');
  });

  it('lingua null -> fallback italiano', () => {
    const body = buildDeflectionBody({ ...baseInput, language: null });
    expect(body.startsWith('Ciao Mario,')).toBe(true);
  });

  it('lingua sconosciuta (jp) -> fallback italiano', () => {
    const body = buildDeflectionBody({ ...baseInput, language: 'jp' });
    expect(body.startsWith('Ciao Mario,')).toBe(true);
  });

  it('lingua con suffisso regionale (it-IT) -> matcha it', () => {
    const body = buildDeflectionBody({ ...baseInput, language: 'it-IT' });
    expect(body.startsWith('Ciao Mario,')).toBe(true);
  });

  it('numero WA viene incluso (formato leggibile, no link wa.me)', () => {
    const body = buildDeflectionBody({ ...baseInput, language: 'it' });
    expect(body).toContain('+39 351 451 2070');
    expect(body).not.toContain('wa.me');
    expect(body).not.toContain('https://');
  });

  it('firma con nome struttura, mai brand Premura', () => {
    const body = buildDeflectionBody({ ...baseInput, language: 'en' });
    expect(body).toContain('— La Goccia di S.Gennaro');
    expect(body).not.toContain('Premura');
  });
});
