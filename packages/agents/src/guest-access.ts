/**
 * Accesso ai codici della struttura dalla piattaforma ospite /g/[token].
 *
 * ─── Perché i codici hanno una finestra ───────────────────────────
 *
 * Il codice del keybox e la password del wifi restano gli stessi tra un
 * ospite e l'altro (cambiarli a ogni turnover non è realistico). Il link
 * /g/[token] invece viene mandato su WhatsApp e lì resta per sempre:
 * senza una finestra, un ospite di aprile potrebbe rileggere il codice
 * della porta a settembre, mentre dentro casa c'è qualcun altro.
 *
 * Da qui due difese indipendenti, entrambe necessarie:
 *
 *  1. Il TOKEN scade al checkout (`expiryForBooking`): dopo, il link
 *     non apre più nulla.
 *  2. La FUNZIONE di gating (`canSeeAccessCodes`) ricontrolla comunque
 *     le date a ogni richiesta. Serve perché un token può essere stato
 *     emesso con una scadenza sbagliata, o il checkout può essere stato
 *     anticipato dopo l'emissione: la verità è la prenotazione, non il
 *     token.
 *
 * Le due difese non si sostituiscono. Un solo controllo, e basta un
 * errore di firma per lasciare i codici visibili a tempo indefinito.
 */

/** Margine prima del check-in in cui i codici sono già visibili. */
export const ACCESS_WINDOW_BEFORE_CHECKIN_HOURS = 24;

/**
 * Margine dopo il checkout. Volutamente stretto: copre l'ospite che
 * riapre l'app mentre chiude la porta, non il giorno dopo.
 */
export const ACCESS_WINDOW_AFTER_CHECKOUT_HOURS = 2;

export type StayWindow = {
  checkinAt: Date;
  checkoutAt: Date;
};

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: 'before_window' | 'after_checkout' | 'cancelled' };

/**
 * L'ospite può vedere i codici in questo momento?
 *
 * @param now iniettato invece di leggere Date.now(): rende la finestra
 *        testabile senza orologi finti.
 */
export function canSeeAccessCodes(
  stay: StayWindow,
  now: Date,
  bookingStatus?: string | null,
): AccessDecision {
  if (bookingStatus === 'cancelled') return { allowed: false, reason: 'cancelled' };

  const apertura = new Date(
    stay.checkinAt.getTime() - ACCESS_WINDOW_BEFORE_CHECKIN_HOURS * 3_600_000,
  );
  const chiusura = new Date(
    stay.checkoutAt.getTime() + ACCESS_WINDOW_AFTER_CHECKOUT_HOURS * 3_600_000,
  );

  if (now < apertura) return { allowed: false, reason: 'before_window' };
  if (now > chiusura) return { allowed: false, reason: 'after_checkout' };
  return { allowed: true };
}

/**
 * Scadenza da usare firmando il token di una prenotazione.
 * Coincide con la chiusura della finestra di accesso: link e codici
 * muoiono insieme.
 */
export function expiryForBooking(checkoutAt: Date): number {
  return checkoutAt.getTime() + ACCESS_WINDOW_AFTER_CHECKOUT_HOURS * 3_600_000;
}

export type AccessCodes = {
  wifiSsid: string | null;
  wifiPassword: string | null;
  wifiNotes: string | null;
  keyboxCode: string | null;
  keyboxInstructions: string | null;
};

const CODICI_OSCURATI: AccessCodes = {
  wifiSsid: null,
  wifiPassword: null,
  wifiNotes: null,
  keyboxCode: null,
  keyboxInstructions: null,
};

export type AccessCodesPayload = {
  visible: boolean;
  reason?: 'before_window' | 'after_checkout' | 'cancelled';
  codes: AccessCodes;
};

/**
 * Costruisce la sezione codici del payload servito a /g/[token].
 *
 * Fuori finestra restituisce campi a null e non i valori reali: il
 * payload di un Server Component viene serializzato per intero nella
 * pagina, quindi "c'è ma non lo mostro" equivale a mostrarlo.
 */
export function buildAccessCodesPayload(input: {
  stay: StayWindow;
  now: Date;
  bookingStatus?: string | null;
  wifi?: { ssid?: string | null; password?: string | null; notes?: string | null } | null;
  keybox?: { code?: string | null; instructions?: string | null } | null;
}): AccessCodesPayload {
  const decision = canSeeAccessCodes(input.stay, input.now, input.bookingStatus);

  if (!decision.allowed) {
    return { visible: false, reason: decision.reason, codes: { ...CODICI_OSCURATI } };
  }

  return {
    visible: true,
    codes: {
      wifiSsid: input.wifi?.ssid ?? null,
      wifiPassword: input.wifi?.password ?? null,
      wifiNotes: input.wifi?.notes ?? null,
      keyboxCode: input.keybox?.code ?? null,
      keyboxInstructions: input.keybox?.instructions ?? null,
    },
  };
}

/** Fascia oraria per il saluto, sul fuso della struttura. */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export function timeOfDay(now: Date, timeZone = 'Europe/Rome'): TimeOfDay {
  const ora = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone }).format(now),
  );
  if (ora >= 5 && ora < 12) return 'morning';
  if (ora >= 12 && ora < 18) return 'afternoon';
  if (ora >= 18 && ora < 23) return 'evening';
  return 'night';
}

const SALUTI: Record<TimeOfDay, { it: string; en: string }> = {
  morning: { it: 'Buongiorno', en: 'Good morning' },
  afternoon: { it: 'Buon pomeriggio', en: 'Good afternoon' },
  evening: { it: 'Buonasera', en: 'Good evening' },
  night: { it: 'Buonanotte', en: 'Good evening' },
};

export function greeting(
  firstName: string | null | undefined,
  now: Date,
  language: 'it' | 'en',
  timeZone = 'Europe/Rome',
): string {
  const base = SALUTI[timeOfDay(now, timeZone)][language];
  const nome = firstName?.trim();
  return nome ? `${base}, ${nome}` : base;
}
