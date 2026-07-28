import {
  type AiDisclosureCustom,
  needsAiDisclosure,
  normalizeLanguage,
  resolveAiDisclosure,
} from './ai-disclosure';

/**
 * Guardia di conformità sugli invii automatici.
 *
 * Punto di strozzatura unico: nessun messaggio automatico deve poter
 * partire senza essere passato di qui. Il resolver della disclosure da
 * solo non basta — su WhatsApp esistono DUE modi di inviare, e uno dei
 * due ignora completamente il testo composto dal nostro codice:
 *
 *  1. FREE-FORM (sendText / sendImage): il corpo lo scriviamo noi, ma
 *     Meta lo accetta SOLO entro 24h dall'ultimo messaggio dell'ospite
 *     ("customer service window"). Fuori finestra risponde errore
 *     131047 e il messaggio non parte.
 *
 *  2. TEMPLATE (sendTemplate): unico modo di iniziare una conversazione
 *     fuori finestra. Il corpo è quello APPROVATO DA META: anteporre
 *     testo a runtime non ha alcun effetto, si possono solo riempire le
 *     variabili. Quindi la disclosure deve stare DENTRO il template
 *     approvato, oppure non raggiungerà mai l'ospite.
 *
 * Da qui la necessità di un registro dei template: il codice non può
 * ispezionare cosa Meta ha approvato, quindi lo dichiariamo noi e
 * teniamo la dichiarazione allineata a mano. Un template non
 * dichiarato viene rifiutato: preferiamo un invio bloccato a un invio
 * non conforme all'AI Act art. 50.
 */

export type TemplateDescriptor = {
  /** Nome esatto del template su Meta Business Manager. */
  name: string;
  /** Codici lingua approvati per questo template (es. 'it', 'en'). */
  languages: string[];
  /**
   * Il corpo APPROVATO contiene già la disclosure AI?
   * Va messo a true solo dopo aver verificato il testo approvato su
   * Meta Business Manager — non "quando lo abbiamo sottomesso".
   */
  bodyContainsAiDisclosure: boolean;
  /** Data della verifica, per audit. */
  verifiedAt?: string;
};

/**
 * Registro dei template Meta conosciuti.
 *
 * VUOTO PERCHÉ NON NE ESISTE NESSUNO. Verificato sul repo: sendTemplate()
 * è implementato in packages/integrations/src/whatsapp-business.ts ma non
 * viene chiamato in nessun punto del codice, e nessun nome di template è
 * definito da nessuna parte. Tutti gli invii odierni sono free-form.
 *
 * Conseguenza operativa: finché questo registro è vuoto, ogni invio
 * via template viene bloccato dalla guardia. È il comportamento voluto —
 * meglio nessun invio che un invio senza disclosure.
 */
export const META_TEMPLATE_REGISTRY: Record<string, TemplateDescriptor> = {};

export type OutboundKind = 'free_form' | 'template';

export type OutboundComplianceInput = {
  kind: OutboundKind;
  /** Corpo effettivo del messaggio. Obbligatorio per free_form. */
  body?: string;
  /** Nome del template Meta. Obbligatorio per kind='template'. */
  templateName?: string;
  language?: string | null;
  /** conversations.ai_disclosure_sent_at — null se mai inviata. */
  aiDisclosureSentAt?: Date | string | null;
  /** hosts.ai_disclosure_custom */
  aiDisclosureCustom?: AiDisclosureCustom;
};

export type ComplianceVerdict =
  | { ok: true; disclosureRequired: boolean }
  | { ok: false; reason: string };

/**
 * Verifica che un invio sia conforme prima di partire.
 *
 * Non modifica il messaggio: dice solo se può partire. Comporre il
 * testo è compito del chiamante (prependAiDisclosure), rifiutarlo è
 * compito di questa funzione.
 */
export function checkOutboundCompliance(input: OutboundComplianceInput): ComplianceVerdict {
  const disclosureRequired = needsAiDisclosure(input.aiDisclosureSentAt);

  if (input.kind === 'template') {
    if (!input.templateName) {
      return { ok: false, reason: 'kind=template senza templateName' };
    }

    const descriptor = META_TEMPLATE_REGISTRY[input.templateName];
    if (!descriptor) {
      return {
        ok: false,
        reason:
          `Template "${input.templateName}" non dichiarato in META_TEMPLATE_REGISTRY. ` +
          `Il codice non può sapere cosa Meta ha approvato: dichiaralo (e verifica ` +
          `che il corpo approvato contenga la disclosure AI) prima di inviarlo.`,
      };
    }

    const lang = normalizeLanguage(input.language);
    if (!descriptor.languages.includes(lang)) {
      return {
        ok: false,
        reason: `Template "${input.templateName}" non è approvato per la lingua "${lang}" (approvate: ${descriptor.languages.join(', ')}).`,
      };
    }

    // Il punto: su un template il nostro codice NON può anteporre nulla.
    // Se il corpo approvato non contiene la disclosure, l'ospite non la
    // riceverà mai, per quanto corretto sia il resto della pipeline.
    if (disclosureRequired && !descriptor.bodyContainsAiDisclosure) {
      return {
        ok: false,
        reason:
          `Template "${input.templateName}" non contiene la disclosure AI nel corpo approvato ` +
          `da Meta, e questa conversazione non l'ha ancora ricevuta. Su un template il testo ` +
          `non è modificabile a runtime: va sottomesso a Meta un template che la includa. ` +
          `(AI Act art. 50, applicabile dal 2 agosto 2026.)`,
      };
    }

    return { ok: true, disclosureRequired };
  }

  // ─── free-form ───────────────────────────────────────────────────
  const body = input.body ?? '';
  if (body.trim().length === 0) {
    return { ok: false, reason: 'corpo del messaggio vuoto' };
  }

  if (disclosureRequired) {
    const expected = resolveAiDisclosure(input.aiDisclosureCustom ?? null, input.language);
    if (!body.includes(expected)) {
      return {
        ok: false,
        reason:
          `Primo messaggio automatico di questa conversazione senza disclosure AI. ` +
          `Anteponila con prependAiDisclosure() prima di inviare. ` +
          `(AI Act art. 50, applicabile dal 2 agosto 2026.)`,
      };
    }
  }

  return { ok: true, disclosureRequired };
}

/** Variante che solleva: da usare come ultima riga di difesa nei worker. */
export class OutboundComplianceError extends Error {
  constructor(reason: string) {
    super(`Invio bloccato dalla guardia di conformità: ${reason}`);
    this.name = 'OutboundComplianceError';
  }
}

export function assertOutboundCompliance(input: OutboundComplianceInput): void {
  const verdict = checkOutboundCompliance(input);
  if (!verdict.ok) throw new OutboundComplianceError(verdict.reason);
}
