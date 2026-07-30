/**
 * Disclosure AI — Regolamento (UE) 2024/1689 ("AI Act"), art. 50 §1.
 *
 * Obbligo: chi interagisce con un sistema di IA deve esserne informato,
 * salvo che sia ovvio per una persona ragionevolmente informata.
 * Applicabile dal 2 agosto 2026.
 *
 * Un ospite che scrive su WhatsApp al numero della villa si aspetta un
 * host umano: qui non c'è nulla di ovvio, quindi la disclosure è dovuta.
 *
 * ─── Perché questo file è scritto così ────────────────────────────
 *
 * Il requisito di prodotto è: "configurabile per host, NON disattivabile".
 * Tradotto in codice: l'host può cambiare le PAROLE, non può ottenere
 * il silenzio. Per questo `resolveAiDisclosure()` non ha un ramo che
 * restituisce stringa vuota — un testo custom vuoto, di soli spazi o
 * assente ricade sul default di lingua. Non esiste un flag booleano
 * `ai_disclosure_enabled`: se esistesse, qualcuno prima o poi lo
 * metterebbe a false.
 *
 * La disclosure va inviata all'INIZIO di ogni conversazione automatica,
 * non a ogni messaggio: `conversations.ai_disclosure_sent_at` registra
 * l'avvenuto invio e `needsAiDisclosure()` decide.
 */

/** Lingue supportate dai template messaggi. */
export const SUPPORTED_LANGUAGES = ['it', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Lingua usata quando quella dell'ospite è ignota o non supportata. */
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

/**
 * Testi predefiniti. Dicono due cose senza giri di parole: che
 * risponde un assistente automatico, e di chi è.
 *
 * NIENTE "scrivi operatore/human per parlare con una persona"
 * (rimosso 30/07 su verifica di Andrea): nessun codice inbound
 * riconosce quella parola — conversation_handover viene solo LETTA
 * in uscita, mai scritta da un keyword. Una promessa fatta a un
 * ospite vero nel primo messaggio va mantenuta dal codice, non
 * dalla speranza. Quando l'handover a parola chiave esisterà, la
 * frase torna.
 */
export const DEFAULT_AI_DISCLOSURE: Record<SupportedLanguage, string> = {
  it: 'Ciao! Ti risponde l’assistente automatico di Villa Cristina.',
  en: 'Hi! You’re chatting with Villa Cristina’s automated assistant.',
};

/**
 * Testi personalizzati dall'host, per lingua. Nullable a ogni livello:
 * l'host può sovrascrivere solo l'italiano e lasciare l'inglese al
 * default. Persistito in hosts.ai_disclosure_custom (jsonb).
 */
export type AiDisclosureCustom = Partial<Record<SupportedLanguage, string | null>> | null;

/** Normalizza una lingua arbitraria ('it-IT', 'EN', null…) a una supportata. */
export function normalizeLanguage(input?: string | null): SupportedLanguage {
  if (!input) return DEFAULT_LANGUAGE;
  const base = input.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base)
    ? (base as SupportedLanguage)
    : DEFAULT_LANGUAGE;
}

/**
 * Restituisce la disclosure da anteporre al primo messaggio automatico.
 *
 * Garanzia: il valore di ritorno non è mai vuoto. È il punto in cui il
 * "non disattivabile" smette di essere una convenzione e diventa una
 * proprietà del codice.
 */
export function resolveAiDisclosure(custom: AiDisclosureCustom, language?: string | null): string {
  const lang = normalizeLanguage(language);
  const candidate = custom?.[lang];

  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate.trim();
  }

  return DEFAULT_AI_DISCLOSURE[lang];
}

/**
 * Anteponi la disclosure al corpo del messaggio.
 *
 * Riga vuota di separazione: su WhatsApp la disclosure deve leggersi
 * come una premessa, non come la prima frase del messaggio.
 */
export function prependAiDisclosure(
  body: string,
  custom: AiDisclosureCustom,
  language?: string | null,
): string {
  return `${resolveAiDisclosure(custom, language)}\n\n${body}`;
}

/**
 * La conversazione ha già ricevuto la disclosure?
 *
 * In dubbio (valore assente o data non valida) si invia: una disclosure
 * ripetuta è un fastidio, una mancata è una violazione.
 */
export function needsAiDisclosure(aiDisclosureSentAt?: Date | string | null): boolean {
  if (!aiDisclosureSentAt) return true;
  const sent =
    aiDisclosureSentAt instanceof Date ? aiDisclosureSentAt : new Date(aiDisclosureSentAt);
  return Number.isNaN(sent.getTime());
}

/**
 * Validazione del testo custom prima del salvataggio (pannello admin).
 *
 * Non entriamo nel merito del contenuto — non è compito del codice
 * giudicare se una frase informa abbastanza — ma un testo troppo corto
 * non può ragionevolmente dire all'ospite che sta parlando con un
 * sistema automatico, e un testo vuoto equivarrebbe a disattivare
 * l'obbligo.
 */
export const AI_DISCLOSURE_MIN_LENGTH = 20;
export const AI_DISCLOSURE_MAX_LENGTH = 300;

export function validateAiDisclosureText(
  text: string,
): { ok: true } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed.length < AI_DISCLOSURE_MIN_LENGTH) {
    return {
      ok: false,
      error: `La disclosure deve essere di almeno ${AI_DISCLOSURE_MIN_LENGTH} caratteri: deve dire chiaramente all'ospite che sta scrivendo con un assistente automatico. Lascia il campo vuoto per usare il testo predefinito.`,
    };
  }
  if (trimmed.length > AI_DISCLOSURE_MAX_LENGTH) {
    return {
      ok: false,
      error: `La disclosure non può superare ${AI_DISCLOSURE_MAX_LENGTH} caratteri.`,
    };
  }
  return { ok: true };
}
