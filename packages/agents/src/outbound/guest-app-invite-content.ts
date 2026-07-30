import { type AiDisclosureCustom, normalizeLanguage, resolveAiDisclosure } from '@premura/shared';

// Invito guest app — il primo contatto quando COMPARE IL NUMERO
// (flusso canonico §2b, punti 2-3: il numero arriva, Premura manda la
// guest app della struttura). Obiettivi: presenza subito dopo la
// prenotazione (prevenire la cancellazione) e canale aperto ("da ora
// puoi scrivere qui per qualsiasi cosa").
//
// Contenuto FISSO come il benvenuto: niente LLM, ogni parola
// verificabile prima che parta. Struttura:
//  1. Disclosure AI (art. 50) col NOME DELLA STRUTTURA — e' l'inizio
//     della conversazione automatica, la disclosure e' dovuta qui.
//  2. Presenza: stiamo preparando il tuo soggiorno.
//  3. Link guest app (chi chiama questo composer garantisce che l'URL
//     esista: senza URL l'invito non parte proprio).
//  4. "Da ora puoi scrivere qui per qualsiasi cosa."
//  5. Firma = nome della struttura (decisione blindata).

export type GuestAppInviteInput = {
  guestFirstName: string | null;
  guestFullName: string;
  propertyName: string;
  language: string | null;
  guestAppUrl: string;
  /** Testo custom dell'host, se impostato (hosts.ai_disclosure_custom). */
  aiDisclosureCustom?: AiDisclosureCustom;
};

/**
 * Disclosure effettive per questo invito: il custom dell'host vince,
 * altrimenti la formula standard col NOME DELLA STRUTTURA (il default
 * fisso in @premura/shared nomina Villa Cristina e sarebbe una bugia
 * per le altre case). Esportata perche' la guardia di conformita' deve
 * confrontare il corpo con LA STESSA stringa che il composer ha usato.
 */
export function guestAppInviteDisclosures(
  propertyName: string,
  hostCustom?: AiDisclosureCustom,
): Record<'it' | 'en', string> {
  return {
    it: hostCustom?.it?.trim() || `Ciao! Ti risponde l’assistente automatico di ${propertyName}.`,
    en:
      hostCustom?.en?.trim() ||
      `Hi! You’re chatting with ${propertyName}’s automated assistant.`,
  };
}

export function composeGuestAppInvite(input: GuestAppInviteInput): string {
  const lang = normalizeLanguage(input.language);
  const name = (input.guestFirstName ?? input.guestFullName).trim();
  const disclosures = guestAppInviteDisclosures(input.propertyName, input.aiDisclosureCustom);

  const lines: string[] = [resolveAiDisclosure(disclosures, lang), ''];

  if (lang === 'it') {
    lines.push(
      `${name}, stiamo preparando tutto per il tuo soggiorno a ${input.propertyName}.`,
      '',
      `Qui trovi la guida della casa e i nostri servizi (tour, transfer, chef): ${input.guestAppUrl}`,
      '',
      'Da ora puoi scrivere qui per qualsiasi cosa — ti rispondiamo subito.',
      '',
      'A presto,',
      input.propertyName,
    );
  } else {
    lines.push(
      `${name}, we're getting everything ready for your stay at ${input.propertyName}.`,
      '',
      `Here you'll find the house guide and our local services (tours, transfers, private chef): ${input.guestAppUrl}`,
      '',
      'From now on you can write here for anything — we reply right away.',
      '',
      'See you soon,',
      input.propertyName,
    );
  }

  return lines.join('\n');
}
