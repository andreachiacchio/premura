/**
 * Payload QR per la connessione WiFi.
 *
 * Formato de-facto standard, riconosciuto nativamente dalla fotocamera
 * di iOS e Android:
 *
 *   WIFI:T:<auth>;S:<ssid>;P:<password>;H:<hidden>;;
 *
 * L'ospite inquadra e si connette: niente password digitata a mano,
 * niente errori di trascrizione su stringhe tipo "Praiano2024" lette
 * da uno schermo.
 *
 * ─── L'escape non è un dettaglio ──────────────────────────────────
 *
 * Nel formato, questi caratteri hanno significato strutturale:
 *
 *   \  ;  ,  :  "
 *
 * Vanno preceduti da backslash, altrimenti una password come
 * `Vi;lla2024` tronca il campo e il QR porta l'ospite a una rete
 * sbagliata o a un errore muto — che è peggio, perché sembra un
 * problema del telefono. Le password reali contengono spesso `;` o
 * `:`, quindi il caso non è teorico.
 *
 * Riferimento: specifica ZXing per i barcode WIFI.
 */

export type WifiAuthType = 'WPA' | 'WEP' | 'nopass';

export type WifiQrInput = {
  ssid: string;
  password?: string | null;
  /** Default WPA, che copre WPA/WPA2/WPA3. */
  authType?: WifiAuthType;
  /** Rete con SSID nascosto. */
  hidden?: boolean;
};

/** Caratteri con significato strutturale nel payload WIFI:. */
const DA_ESCAPARE = /([\\;,:"])/g;

export function escapeWifiValue(value: string): string {
  return value.replace(DA_ESCAPARE, '\\$1');
}

/**
 * Costruisce la stringa da codificare nel QR.
 *
 * @returns null se manca l'SSID: senza rete non c'è nulla da mostrare,
 *          e un QR malformato è peggio di nessun QR.
 */
export function buildWifiQrPayload(input: WifiQrInput): string | null {
  const ssid = input.ssid?.trim();
  if (!ssid) return null;

  const password = input.password?.trim() || '';
  // Rete aperta: il campo password si omette del tutto, non si lascia
  // vuoto — alcuni lettori interpretano P:; come password letterale.
  const auth: WifiAuthType = password ? (input.authType ?? 'WPA') : 'nopass';

  const parti = [`T:${auth}`, `S:${escapeWifiValue(ssid)}`];
  if (password) parti.push(`P:${escapeWifiValue(password)}`);
  if (input.hidden) parti.push('H:true');

  return `WIFI:${parti.join(';')};;`;
}

/**
 * Sezione WiFi servita alla piattaforma ospite.
 *
 * Segue la stessa regola dei codici d'accesso: i valori escono solo
 * dentro la finestra valida del token. Fuori, i campi sono null e non
 * "presenti ma nascosti" — il payload di un Server Component viene
 * serializzato per intero nella pagina.
 */
export type WifiSection = {
  visible: boolean;
  ssid: string | null;
  password: string | null;
  notes: string | null;
  /** Stringa da dare a un encoder QR. null se non visibile o senza SSID. */
  qrPayload: string | null;
};

export function buildWifiSection(input: {
  visible: boolean;
  wifi?: { ssid?: string | null; password?: string | null; notes?: string | null } | null;
}): WifiSection {
  if (!input.visible || !input.wifi) {
    return { visible: false, ssid: null, password: null, notes: null, qrPayload: null };
  }

  const ssid = input.wifi.ssid?.trim() || null;
  const password = input.wifi.password?.trim() || null;

  return {
    visible: true,
    ssid,
    password,
    notes: input.wifi.notes?.trim() || null,
    qrPayload: ssid ? buildWifiQrPayload({ ssid, password }) : null,
  };
}
