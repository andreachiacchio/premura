import {
  type WhatsappSendError,
  sendImage as sendImageViaCloud,
  sendText as sendTextViaCloud,
} from './whatsapp-business';
import { type WahaSendError, sendImageViaWaha, sendTextViaWaha } from './whatsapp-waha';

/**
 * Punto di strozzatura unico per OGNI invio WhatsApp di Premura.
 *
 * PERCHE' DUE TRASPORTI
 *
 * Meta Cloud API ha la finestra di 24h: fuori da quella si puo' scrivere
 * solo con un template approvato, e il testo di un template non e'
 * modificabile a runtime. Per il pilot interno (Villa Cristina + i due B&B
 * di Napoli) questo e' bloccante: l'ospite non ha mai scritto per primo,
 * quindi non c'e' nessuna finestra aperta e non abbiamo template approvati
 * (META_TEMPLATE_REGISTRY e' vuoto, vedi packages/shared/src/outbound-guard).
 *
 * WAHA gira sul numero reale via WhatsApp Web: nessuna finestra, nessun
 * template, si scrive per primi. Ma richiede un server nostro con la
 * sessione agganciata, quindi non e' proponibile a un host terzo.
 *
 * Da qui la scelta: WHATSAPP_TRANSPORT=waha per noi, =cloud per gli host
 * terzi quando venderemo. Il codice Cloud API resta intatto in
 * whatsapp-business.ts — non e' codice morto, e' il percorso di domani.
 *
 * REGOLA
 *
 * Nessun altro file deve importare whatsapp-business o whatsapp-waha.
 * Il barrel (index.ts) esporta sendText/sendImage da QUI, quindi tutti i
 * chiamanti esistenti passano di qua senza modifiche. Se un domani
 * qualcuno aggiunge un terzo trasporto, si tocca solo questo file.
 */

export type WhatsappTransport = 'waha' | 'cloud';

/** Errore unificato: il chiamante non deve sapere quale trasporto ha fallito. */
export type WhatsappTransportError = WhatsappSendError | WahaSendError;

/**
 * Invio BLOCCATO dal kill switch: nessuna chiamata di rete, nessun
 * messaggio partito.
 *
 * PERCHE' E' UN ERRORE E NON UN VALORE DI RITORNO (Andrea, 05/08).
 *
 * Fino a oggi sendText/sendImage ritornavano `{ skippedReason }` e
 * cinque chiamanti su otto lo ignoravano: registravano "inviato",
 * facevano avanzare lo stato, e il messaggio non ripartiva piu'.
 * Il benvenuto all'ospite, il brief al cleaner, il magic link, il
 * sondaggio: tutti bruciati in silenzio.
 *
 * Un contratto che si sbaglia per omissione e' sbagliato. Adesso il
 * default lancia: chi non fa nulla si ferma, invece di mentire.
 *
 * Chi PUO' tollerare lo skip lo dichiara con `allowSkip: true`, e in
 * quel ramo deve registrare il motivo — e' il caso di reserveAndSend,
 * che marca lo slot 'skipped' nell'audit trail.
 *
 * NOTA sul dry-run: NON lancia. E' una modalita' progettata, con il suo
 * audit trail (outbound_sends.dryRun, "simulato" in dashboard): serve a
 * esercitare la pipeline, non e' un blocco. Chi fa avanzare stato
 * irreversibile deve comunque guardare `outcome.dryRun`.
 */
export class WhatsappSendSkipped extends Error {
  readonly reason: 'kill_switch';
  readonly transport: WhatsappTransport;

  constructor(reason: 'kill_switch', transport: WhatsappTransport) {
    super(
      `Invio WhatsApp bloccato da ${reason}: nessun messaggio partito. ` +
        'Se questo percorso puo tollerarlo, passa allowSkip: true e registra il motivo.',
    );
    this.name = 'WhatsappSendSkipped';
    this.reason = reason;
    this.transport = transport;
  }
}

export function resolveTransport(): WhatsappTransport {
  // Stringa vuota trattata come assente: un secret Fly dichiarato ma non
  // valorizzato, o una riga `WHATSAPP_TRANSPORT=` in .env, arrivano come
  // '' e non come undefined. Con `??` da solo farebbero throw a ogni
  // invio invece di ricadere sul default.
  const raw = (process.env.WHATSAPP_TRANSPORT ?? '').trim().toLowerCase();
  if (raw === '') return 'cloud';
  if (raw === 'waha' || raw === 'cloud') return raw;
  throw new Error(`WHATSAPP_TRANSPORT="${raw}" non valido. Valori ammessi: 'waha' | 'cloud'.`);
}

// ─── Paracadute che non richiedono il database ──────────────────────
//
// Quelli che richiedono il DB (slot outbound_sends con UNIQUE(booking_id,
// trigger), tetto giornaliero, handover) stanno un livello sopra, nel
// send guard che prenota lo slot PRIMA di chiamare questo modulo. Qui
// vivono solo i tre che dipendono da configurazione e non da stato.

/**
 * Interruttore generale. Nessun messaggio parte, nemmeno con il dry-run
 * disattivato. E' l'ultima riga di difesa e si legge a ogni invio, non
 * al boot: si sblocca senza redeploy.
 *
 * ATTIVO A MENO CHE il valore non sia esattamente 'off' (06/08, Andrea).
 * Prima era il contrario — attivo solo con 'on' — e voleva dire che un
 * refuso, una maiuscola, uno spazio o una variabile cancellata per
 * sbaglio staccavano il freno *in silenzio*. Il modo di fallire era
 * "manda", ed era il verso sbagliato: Premura scrive su WhatsApp da un
 * numero che, se bannato, non si appella. Ora un ambiente che perde la
 * variabile smette di inviare invece di iniziare, e per mandare davvero
 * bisogna dichiararlo. Lo stato effettivo viene stampato all'avvio
 * dell'API chiamando questa stessa funzione, quindi il guasto si vede.
 */
export function isKillSwitchOn(): boolean {
  return (process.env.WHATSAPP_KILL_SWITCH ?? '').trim().toLowerCase() !== 'off';
}

/**
 * DRY_RUN e' il DEFAULT. Serve un opt-out esplicito per mandare davvero.
 *
 * Il verso della condizione e' deliberato: una variabile mancante, vuota o
 * scritta male lascia il sistema in simulazione. L'errore di
 * configurazione non deve mai tradursi in messaggi veri sul numero della
 * villa.
 */
export function isDryRun(): boolean {
  return (process.env.WHATSAPP_DRY_RUN ?? 'true').trim().toLowerCase() !== 'false';
}

const JITTER_MIN_MS = 30_000;
const JITTER_MAX_MS = 60_000;

/**
 * Ritardo casuale 30-60s prima di ogni invio reale.
 *
 * Non e' cortesia: e' l'unica cosa che distingue il nostro traffico da una
 * raffica automatica. WhatsApp banna i numeri che mandano N messaggi
 * identici nello stesso secondo, e il numero in gioco e' quello vero della
 * struttura. Il valore applicato viene restituito per essere scritto in
 * outbound_sends.jitter_applied_ms: serve a dimostrare a posteriori che
 * non abbiamo fatto raffiche.
 */
export function pickJitterMs(): number {
  return JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1));
}

export type SendOutcome = {
  /** ID del messaggio lato provider. Null in dry-run. */
  messageId: string | null;
  transport: WhatsappTransport;
  /** true = nessuna chiamata di rete effettuata. */
  dryRun: boolean;
  /** Ritardo realmente applicato, per l'audit trail. */
  jitterAppliedMs: number;
  /** Valorizzato quando l'invio e' stato saltato, con il motivo. */
  skippedReason?: 'kill_switch';
};

export type SendTextInput = {
  to: string;
  body: string;
  /**
   * Salta il jitter. Da usare SOLO per i messaggi a un operatore umano
   * (brief cleaner, alert al founder): sono a bassa frequenza e verso
   * numeri nostri, e li' l'attesa e' solo latenza inutile. Mai true per
   * un messaggio a un ospite.
   */
  immediate?: boolean;
};

export type SendImageInput = SendTextInput & { imageUrl: string; caption?: string };

async function applyJitter(immediate: boolean): Promise<number> {
  if (immediate) return 0;
  const ms = pickJitterMs();
  await new Promise((resolve) => setTimeout(resolve, ms));
  return ms;
}

/** Invio di testo. Unica porta verso WhatsApp per tutto il progetto. */
export async function sendText(
  to: string,
  body: string,
  opts: { immediate?: boolean; allowSkip?: boolean } = {},
): Promise<SendOutcome> {
  const transport = resolveTransport();

  if (isKillSwitchOn()) {
    if (!opts.allowSkip) throw new WhatsappSendSkipped('kill_switch', transport);
    return {
      messageId: null,
      transport,
      dryRun: true,
      jitterAppliedMs: 0,
      skippedReason: 'kill_switch',
    };
  }

  if (isDryRun()) {
    // Nessuna chiamata di rete, nessuna attesa: il dry-run serve a
    // verificare la pipeline, non a farla aspettare un minuto.
    return { messageId: null, transport, dryRun: true, jitterAppliedMs: 0 };
  }

  const jitterAppliedMs = await applyJitter(opts.immediate ?? false);
  const res =
    transport === 'waha' ? await sendTextViaWaha(to, body) : await sendTextViaCloud(to, body);

  return { messageId: res.messageId, transport, dryRun: false, jitterAppliedMs };
}

/** Invio di immagine con didascalia (welcome message con foto del kit). */
export async function sendImage(params: {
  to: string;
  imageUrl: string;
  caption?: string;
  immediate?: boolean;
  allowSkip?: boolean;
}): Promise<SendOutcome> {
  const transport = resolveTransport();

  if (isKillSwitchOn()) {
    if (!params.allowSkip) throw new WhatsappSendSkipped('kill_switch', transport);
    return {
      messageId: null,
      transport,
      dryRun: true,
      jitterAppliedMs: 0,
      skippedReason: 'kill_switch',
    };
  }

  if (isDryRun()) {
    return { messageId: null, transport, dryRun: true, jitterAppliedMs: 0 };
  }

  const jitterAppliedMs = await applyJitter(params.immediate ?? false);
  const res =
    transport === 'waha'
      ? await sendImageViaWaha(params)
      : await sendImageViaCloud({
          to: params.to,
          imageUrl: params.imageUrl,
          caption: params.caption,
        });

  return { messageId: res.messageId, transport, dryRun: false, jitterAppliedMs };
}
