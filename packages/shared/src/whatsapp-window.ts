/**
 * Finestra di servizio clienti WhatsApp (24h).
 *
 * ─── Il vincolo, in breve ─────────────────────────────────────────
 *
 * Meta consente di inviare messaggi liberi a un utente solo entro 24 ore
 * dal SUO ultimo messaggio. Fuori da quella finestra l'unico modo di
 * scrivere è un template pre-approvato; un invio libero viene rifiutato
 * con errore 131047.
 *
 * Il timer riparte a ogni messaggio in ingresso dell'ospite. Non lo
 * riapre nulla che facciamo noi: né inviare, né aggiungere il numero in
 * dashboard, né attivare l'agente.
 *
 * ─── Perché serve mostrarlo all'host ──────────────────────────────
 *
 * Finché la dashboard dice solo "inserisci il numero per attivare
 * l'agente", promette una cosa che il sistema non può mantenere: col
 * numero inserito ma la finestra chiusa e nessun template approvato,
 * l'invio fallisce e l'host lo scopre dall'ospite che non ha ricevuto
 * nulla. Meglio dire in anticipo cosa può e cosa non può partire.
 */

export const WHATSAPP_WINDOW_HOURS = 24;
const WINDOW_MS = WHATSAPP_WINDOW_HOURS * 3_600_000;

/** Soglia sotto la quale conviene avvisare che sta per chiudersi. */
export const WINDOW_CLOSING_SOON_MINUTES = 120;

export type WhatsappWindowState =
  /** L'ospite ha scritto entro 24h: possiamo rispondere liberamente. */
  | 'open'
  /** Aperta ma agli sgoccioli: utile per dare precedenza. */
  | 'closing_soon'
  /** L'ospite ha scritto, ma più di 24h fa. Serve un template. */
  | 'closed'
  /** L'ospite non ha mai scritto: la finestra non si è mai aperta. */
  | 'never_opened';

export type WhatsappWindow = {
  state: WhatsappWindowState;
  /** Istante di chiusura. null se non si è mai aperta. */
  expiresAt: Date | null;
  /** Minuti residui, 0 se chiusa o mai aperta. */
  remainingMinutes: number;
  /** Un messaggio libero partirebbe adesso? */
  canSendFreeForm: boolean;
};

export function computeWhatsappWindow(
  lastInboundAt: Date | string | null | undefined,
  now: Date = new Date(),
): WhatsappWindow {
  if (!lastInboundAt) {
    return { state: 'never_opened', expiresAt: null, remainingMinutes: 0, canSendFreeForm: false };
  }

  const last = lastInboundAt instanceof Date ? lastInboundAt : new Date(lastInboundAt);
  if (Number.isNaN(last.getTime())) {
    // Data illeggibile: trattata come "mai aperta". In dubbio non si
    // promette un invio che potrebbe fallire.
    return { state: 'never_opened', expiresAt: null, remainingMinutes: 0, canSendFreeForm: false };
  }

  const expiresAt = new Date(last.getTime() + WINDOW_MS);
  const remainingMs = expiresAt.getTime() - now.getTime();

  if (remainingMs <= 0) {
    return { state: 'closed', expiresAt, remainingMinutes: 0, canSendFreeForm: false };
  }

  const remainingMinutes = Math.floor(remainingMs / 60_000);
  return {
    state: remainingMinutes <= WINDOW_CLOSING_SOON_MINUTES ? 'closing_soon' : 'open',
    expiresAt,
    remainingMinutes,
    canSendFreeForm: true,
  };
}

/**
 * Cosa può realmente partire per questa prenotazione, adesso.
 *
 * Mette insieme i tre vincoli che decidono l'esito di un invio:
 * il numero, la finestra, e l'esistenza di un template approvato.
 * Serve a scrivere in dashboard una frase vera invece di un invito
 * generico ad attivare l'agente.
 */
export type SendabilityInput = {
  hasPhone: boolean;
  lastInboundAt?: Date | string | null;
  /** Esiste almeno un template Meta approvato e utilizzabile? */
  hasApprovedTemplate: boolean;
  now?: Date;
};

export type Sendability = {
  window: WhatsappWindow;
  canSendNow: boolean;
  /** Motivo per cui NON si può inviare. null se si può. */
  blocker: 'no_phone' | 'window_closed_no_template' | null;
  /** Frase per l'host, in italiano, onesta su cosa succede. */
  hostMessage: string;
};

export function computeSendability(input: SendabilityInput): Sendability {
  const now = input.now ?? new Date();
  const window = computeWhatsappWindow(input.lastInboundAt, now);

  if (!input.hasPhone) {
    return {
      window,
      canSendNow: false,
      blocker: 'no_phone',
      hostMessage: 'Manca il numero WhatsApp: senza non possiamo contattare l’ospite.',
    };
  }

  if (window.canSendFreeForm) {
    const ore = Math.floor(window.remainingMinutes / 60);
    const minuti = window.remainingMinutes % 60;
    const residuo = ore > 0 ? `${ore}h ${minuti}m` : `${minuti}m`;
    return {
      window,
      canSendNow: true,
      blocker: null,
      hostMessage:
        window.state === 'closing_soon'
          ? `L’ospite ha scritto di recente: possiamo rispondere ancora per ${residuo}.`
          : `Conversazione aperta: possiamo scrivere liberamente per altre ${residuo}.`,
    };
  }

  // Finestra chiusa o mai aperta: serve un template approvato.
  if (input.hasApprovedTemplate) {
    return {
      window,
      canSendNow: true,
      blocker: null,
      hostMessage:
        window.state === 'never_opened'
          ? 'L’ospite non ha ancora scritto: il primo messaggio parte da un template approvato.'
          : 'Sono passate più di 24h dall’ultimo messaggio dell’ospite: scriviamo con un template approvato.',
    };
  }

  return {
    window,
    canSendNow: false,
    blocker: 'window_closed_no_template',
    hostMessage:
      window.state === 'never_opened'
        ? 'L’ospite non ha ancora scritto e non ci sono template approvati: WhatsApp non ci lascia iniziare la conversazione. Mandagli il link via email — quando risponde, l’agente può lavorare.'
        : 'Sono passate più di 24h dall’ultimo messaggio dell’ospite e non ci sono template approvati: un invio ora verrebbe rifiutato da WhatsApp. Aspetta che scriva lui, oppure contattalo per email.',
  };
}
