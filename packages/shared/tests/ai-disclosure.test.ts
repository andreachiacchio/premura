import { describe, expect, it } from 'vitest';
import {
  AI_DISCLOSURE_MAX_LENGTH,
  AI_DISCLOSURE_MIN_LENGTH,
  DEFAULT_AI_DISCLOSURE,
  SUPPORTED_LANGUAGES,
  needsAiDisclosure,
  normalizeLanguage,
  prependAiDisclosure,
  resolveAiDisclosure,
  validateAiDisclosureText,
} from '../src/ai-disclosure';

describe('ai-disclosure — AI Act art. 50', () => {
  describe('non disattivabile', () => {
    // Il cuore del requisito: nessun input deve poter produrre il
    // silenzio. Se un giorno qualcuno introduce un ramo che restituisce
    // stringa vuota, questi test cadono.
    const tentativiDiDisattivazione = [
      ['custom null', null],
      ['oggetto vuoto', {}],
      ['stringa vuota', { it: '', en: '' }],
      ['soli spazi', { it: '   ', en: '\t\n ' }],
      ['valori null', { it: null, en: null }],
      ['lingua assente dal custom', { it: 'Testo solo italiano' }],
    ] as const;

    for (const [caso, custom] of tentativiDiDisattivazione) {
      for (const lang of SUPPORTED_LANGUAGES) {
        it(`${caso} → ricade sul default (${lang})`, () => {
          const result = resolveAiDisclosure(custom as never, lang);
          expect(result.trim().length).toBeGreaterThan(0);
          if (caso === 'lingua assente dal custom' && lang === 'it') {
            expect(result).toBe('Testo solo italiano');
          } else {
            expect(result).toBe(DEFAULT_AI_DISCLOSURE[lang]);
          }
        });
      }
    }

    it('nessuna lingua supportata resta senza testo predefinito', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        expect(DEFAULT_AI_DISCLOSURE[lang].trim().length).toBeGreaterThanOrEqual(
          AI_DISCLOSURE_MIN_LENGTH,
        );
      }
    });
  });

  describe('personalizzazione host', () => {
    it('usa il testo custom quando valorizzato', () => {
      const custom = { en: 'Automated assistant here — reply HUMAN for a person.' };
      expect(resolveAiDisclosure(custom, 'en')).toBe(
        'Automated assistant here — reply HUMAN for a person.',
      );
    });

    it('taglia gli spazi ai bordi del testo custom', () => {
      expect(resolveAiDisclosure({ it: '  Assistente automatico attivo.  ' }, 'it')).toBe(
        'Assistente automatico attivo.',
      );
    });
  });

  describe('normalizzazione lingua', () => {
    it.each([
      ['it', 'it'],
      ['IT', 'it'],
      ['it-IT', 'it'],
      ['it_IT', 'it'],
      ['en', 'en'],
      ['en-GB', 'en'],
      // Lingue non supportate e input degeneri → default EN, mai crash
      // e mai assenza di disclosure.
      ['de', 'en'],
      ['fr-FR', 'en'],
      ['', 'en'],
      [null, 'en'],
      [undefined, 'en'],
    ])('normalizeLanguage(%s) = %s', (input, atteso) => {
      expect(normalizeLanguage(input as string | null | undefined)).toBe(atteso);
    });

    it('una lingua sconosciuta riceve comunque una disclosure', () => {
      const result = resolveAiDisclosure(null, 'ja');
      expect(result).toBe(DEFAULT_AI_DISCLOSURE.en);
      expect(result.trim().length).toBeGreaterThan(0);
    });
  });

  describe('prependAiDisclosure', () => {
    it('antepone la disclosure separata da una riga vuota', () => {
      const out = prependAiDisclosure('Benvenuto a Villa Cristina!', null, 'it');
      expect(out.startsWith(DEFAULT_AI_DISCLOSURE.it)).toBe(true);
      expect(out).toContain('\n\nBenvenuto a Villa Cristina!');
    });

    it('il corpo del messaggio resta intatto', () => {
      const body = 'Riga 1\nRiga 2\n\nRiga 4';
      expect(prependAiDisclosure(body, null, 'en').endsWith(body)).toBe(true);
    });
  });

  describe('needsAiDisclosure', () => {
    it('serve se non risulta ancora inviata', () => {
      expect(needsAiDisclosure(null)).toBe(true);
      expect(needsAiDisclosure(undefined)).toBe(true);
    });

    it('non serve se già inviata in questa conversazione', () => {
      expect(needsAiDisclosure(new Date('2026-07-27T10:00:00Z'))).toBe(false);
      expect(needsAiDisclosure('2026-07-27T10:00:00Z')).toBe(false);
    });

    it('in dubbio invia: una data non valida vale come non inviata', () => {
      expect(needsAiDisclosure('non-una-data')).toBe(true);
    });
  });

  describe('validazione testo custom', () => {
    it('rifiuta un testo troppo corto (equivarrebbe a disattivarla)', () => {
      const result = validateAiDisclosureText('bot');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(String(AI_DISCLOSURE_MIN_LENGTH));
    });

    it('rifiuta la stringa vuota', () => {
      expect(validateAiDisclosureText('   ').ok).toBe(false);
    });

    it('rifiuta un testo oltre il limite', () => {
      expect(validateAiDisclosureText('a'.repeat(AI_DISCLOSURE_MAX_LENGTH + 1)).ok).toBe(false);
    });

    it('accetta un testo di lunghezza ragionevole', () => {
      expect(
        validateAiDisclosureText('Ti risponde un assistente automatico della struttura.').ok,
      ).toBe(true);
    });
  });
});
