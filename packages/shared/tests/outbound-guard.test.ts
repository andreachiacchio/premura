import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_DISCLOSURE, prependAiDisclosure } from '../src/ai-disclosure';
import {
  META_TEMPLATE_REGISTRY,
  OutboundComplianceError,
  assertOutboundCompliance,
  checkOutboundCompliance,
} from '../src/outbound-guard';

/**
 * Questi test rispondono alla domanda "cosa succede se un invio parte
 * senza disclosure": deve fallire. Sono l'ultima rete prima di Meta.
 */

describe('outbound-guard — nessun invio senza disclosure', () => {
  describe('free-form', () => {
    it('BLOCCA il primo messaggio di una conversazione se privo di disclosure', () => {
      const verdict = checkOutboundCompliance({
        kind: 'free_form',
        body: 'Benvenuto a Villa Cristina! Il check-in è dalle 15.',
        language: 'it',
        aiDisclosureSentAt: null,
      });

      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.reason).toContain('disclosure');
    });

    it('assertOutboundCompliance solleva OutboundComplianceError', () => {
      expect(() =>
        assertOutboundCompliance({
          kind: 'free_form',
          body: 'Testo senza disclosure',
          language: 'it',
          aiDisclosureSentAt: null,
        }),
      ).toThrow(OutboundComplianceError);
    });

    it('PASSA quando la disclosure è stata anteposta', () => {
      const body = prependAiDisclosure('Benvenuto a Villa Cristina!', null, 'it');
      const verdict = checkOutboundCompliance({
        kind: 'free_form',
        body,
        language: 'it',
        aiDisclosureSentAt: null,
      });

      expect(verdict).toEqual({ ok: true, disclosureRequired: true });
    });

    it('PASSA senza disclosure se la conversazione l’ha già ricevuta', () => {
      const verdict = checkOutboundCompliance({
        kind: 'free_form',
        body: 'Come va il soggiorno?',
        language: 'it',
        aiDisclosureSentAt: new Date('2026-07-27T09:00:00Z'),
      });

      expect(verdict).toEqual({ ok: true, disclosureRequired: false });
    });

    it('la disclosure deve essere quella della lingua giusta', () => {
      // Corpo in inglese ma disclosure italiana: non conforme per un
      // ospite che legge in inglese.
      const body = `${DEFAULT_AI_DISCLOSURE.it}\n\nWelcome to Villa Cristina!`;
      const verdict = checkOutboundCompliance({
        kind: 'free_form',
        body,
        language: 'en',
        aiDisclosureSentAt: null,
      });

      expect(verdict.ok).toBe(false);
    });

    it('rispetta il testo personalizzato dall’host', () => {
      const custom = { it: 'Assistente automatico di Villa Cristina in ascolto.' };
      const body = prependAiDisclosure('Benvenuto!', custom, 'it');

      expect(
        checkOutboundCompliance({
          kind: 'free_form',
          body,
          language: 'it',
          aiDisclosureSentAt: null,
          aiDisclosureCustom: custom,
        }).ok,
      ).toBe(true);

      // Lo stesso corpo, senza dichiarare il custom, non contiene il
      // default: viene bloccato. La guardia non si accontenta di "c'è
      // del testo prima".
      expect(
        checkOutboundCompliance({
          kind: 'free_form',
          body,
          language: 'it',
          aiDisclosureSentAt: null,
        }).ok,
      ).toBe(false);
    });

    it('blocca un corpo vuoto', () => {
      expect(
        checkOutboundCompliance({
          kind: 'free_form',
          body: '   ',
          language: 'it',
          aiDisclosureSentAt: new Date(),
        }).ok,
      ).toBe(false);
    });
  });

  describe('template Meta', () => {
    it('oggi il registro è VUOTO: nessun template Premura esiste', () => {
      // Fotografia dello stato reale del progetto: sendTemplate() è
      // implementato ma non chiamato, e nessun template è definito.
      // Quando ne verrà creato uno su Meta, questo test va aggiornato
      // insieme al registro — deliberatamente, non per inerzia.
      expect(Object.keys(META_TEMPLATE_REGISTRY)).toEqual([]);
    });

    it('BLOCCA un template non dichiarato nel registro', () => {
      const verdict = checkOutboundCompliance({
        kind: 'template',
        templateName: 'welcome_praiano',
        language: 'it',
        aiDisclosureSentAt: null,
      });

      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.reason).toContain('non dichiarato');
    });

    it('BLOCCA un template il cui corpo approvato non contiene la disclosure', () => {
      // Il caso che il codice da solo non può risolvere: su un template
      // il testo non è modificabile a runtime.
      const registro = { ...META_TEMPLATE_REGISTRY };
      try {
        META_TEMPLATE_REGISTRY.welcome_v1 = {
          name: 'welcome_v1',
          languages: ['it', 'en'],
          bodyContainsAiDisclosure: false,
        };

        const verdict = checkOutboundCompliance({
          kind: 'template',
          templateName: 'welcome_v1',
          language: 'it',
          aiDisclosureSentAt: null,
        });

        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toContain('non è modificabile a runtime');
      } finally {
        for (const k of Object.keys(META_TEMPLATE_REGISTRY)) delete META_TEMPLATE_REGISTRY[k];
        Object.assign(META_TEMPLATE_REGISTRY, registro);
      }
    });

    it('PASSA un template dichiarato con disclosure nel corpo approvato', () => {
      const registro = { ...META_TEMPLATE_REGISTRY };
      try {
        META_TEMPLATE_REGISTRY.welcome_v2 = {
          name: 'welcome_v2',
          languages: ['it', 'en'],
          bodyContainsAiDisclosure: true,
          verifiedAt: '2026-07-27',
        };

        expect(
          checkOutboundCompliance({
            kind: 'template',
            templateName: 'welcome_v2',
            language: 'it',
            aiDisclosureSentAt: null,
          }).ok,
        ).toBe(true);
      } finally {
        for (const k of Object.keys(META_TEMPLATE_REGISTRY)) delete META_TEMPLATE_REGISTRY[k];
        Object.assign(META_TEMPLATE_REGISTRY, registro);
      }
    });

    it('BLOCCA un template in una lingua non approvata', () => {
      const registro = { ...META_TEMPLATE_REGISTRY };
      try {
        META_TEMPLATE_REGISTRY.solo_it = {
          name: 'solo_it',
          languages: ['it'],
          bodyContainsAiDisclosure: true,
        };

        const verdict = checkOutboundCompliance({
          kind: 'template',
          templateName: 'solo_it',
          language: 'en',
          aiDisclosureSentAt: null,
        });

        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toContain('lingua');
      } finally {
        for (const k of Object.keys(META_TEMPLATE_REGISTRY)) delete META_TEMPLATE_REGISTRY[k];
        Object.assign(META_TEMPLATE_REGISTRY, registro);
      }
    });

    it('BLOCCA kind=template senza templateName', () => {
      expect(
        checkOutboundCompliance({ kind: 'template', language: 'it', aiDisclosureSentAt: null }).ok,
      ).toBe(false);
    });
  });
});
