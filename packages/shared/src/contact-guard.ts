// REGOLA DI BUSINESS (Andrea, 30/07 — non negoziabile): i contatti dei
// fornitori non escono MAI verso l'ospite. Se l'ospite ottiene il numero
// del fornitore, li scavalca e prenota diretto: Premura E' il
// coordinatore, quello e' il servizio. I contatti host-side (Paolo,
// Grazia) invece SONO condivisibili: la distinzione sta nella tabella
// providers (contact_visibility), non qui.
//
// Il controllo e' sul testo in uscita: si normalizzano le cifre del
// corpo (spazi, punti, trattini, prefissi spariscono) e si cerca il
// numero del fornitore come sottosequenza. "350 032 8207", "+39
// 350.03.28.207" e "3500328207" sono lo stesso leak. Falso positivo =
// invio bloccato: fallire chiuso e' il comportamento giusto qui.

/** Tutte le cifre di una stringa, senza separatori. */
function digitsOf(text: string): string {
  return text.replace(/\D+/g, '');
}

/**
 * Varianti riconoscibili di un numero: com'e' scritto, e senza il
 * prefisso internazionale 39 (l'agente potrebbe scriverlo nazionale).
 * Sotto le 8 cifre non si cerca: troppo corto, troverebbe date e prezzi.
 */
function phoneVariants(phone: string): string[] {
  const digits = digitsOf(phone);
  if (digits.length < 8) return [];
  const variants = [digits];
  if (digits.startsWith('39') && digits.length >= 10) {
    variants.push(digits.slice(2));
  }
  return variants;
}

/**
 * Il body contiene uno dei numeri vietati? Ritorna il numero trovato
 * (per il log) o null. I numeri null/vuoti in lista vengono ignorati.
 */
export function findForbiddenPhone(
  body: string,
  forbiddenPhones: Array<string | null | undefined>,
): string | null {
  const bodyDigits = digitsOf(body);
  if (!bodyDigits) return null;
  for (const phone of forbiddenPhones) {
    if (!phone) continue;
    for (const variant of phoneVariants(phone)) {
      if (bodyDigits.includes(variant)) return phone;
    }
  }
  return null;
}
