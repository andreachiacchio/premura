import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dei due trasporti: qui testiamo la logica del punto di strozzatura
// (scelta trasporto, kill switch, dry-run, jitter), non le chiamate HTTP.
const wahaText = vi.fn();
const wahaImage = vi.fn();
const cloudText = vi.fn();
const cloudImage = vi.fn();

vi.mock('../src/whatsapp-waha', () => ({
  sendTextViaWaha: (...a: unknown[]) => wahaText(...a),
  sendImageViaWaha: (...a: unknown[]) => wahaImage(...a),
  WahaSendError: class extends Error {},
}));

vi.mock('../src/whatsapp-business', () => ({
  sendText: (...a: unknown[]) => cloudText(...a),
  sendImage: (...a: unknown[]) => cloudImage(...a),
  WhatsappSendError: class extends Error {},
}));

const {
  WhatsappSendSkipped,
  isDryRun,
  isKillSwitchOn,
  pickJitterMs,
  resolveTransport,
  sendImage,
  sendText,
} = await import('../src/whatsapp-transport');

/** Invio reale = dry-run disattivato esplicitamente + kill switch spento. */
function armLiveSending(transport: 'waha' | 'cloud'): void {
  vi.stubEnv('WHATSAPP_TRANSPORT', transport);
  vi.stubEnv('WHATSAPP_DRY_RUN', 'false');
  vi.stubEnv('WHATSAPP_KILL_SWITCH', 'off');
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const m of [wahaText, wahaImage, cloudText, cloudImage]) m.mockReset();
  wahaText.mockResolvedValue({ messageId: 'waha-1' });
  wahaImage.mockResolvedValue({ messageId: 'waha-img-1' });
  cloudText.mockResolvedValue({ messageId: 'wamid.CLOUD' });
  cloudImage.mockResolvedValue({ messageId: 'wamid.CLOUDIMG' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('resolveTransport', () => {
  it('default cloud quando la variabile non e settata', () => {
    vi.stubEnv('WHATSAPP_TRANSPORT', '');
    expect(resolveTransport()).toBe('cloud');
  });

  it('accetta waha e cloud, case-insensitive', () => {
    vi.stubEnv('WHATSAPP_TRANSPORT', 'WAHA');
    expect(resolveTransport()).toBe('waha');
    vi.stubEnv('WHATSAPP_TRANSPORT', ' Cloud ');
    expect(resolveTransport()).toBe('cloud');
  });

  it('solleva su un valore non riconosciuto invece di ripiegare su un default', () => {
    // Un typo in WHATSAPP_TRANSPORT non deve tradursi silenziosamente nel
    // trasporto sbagliato: si sbaglierebbe numero, non solo canale.
    vi.stubEnv('WHATSAPP_TRANSPORT', 'wahaa');
    expect(() => resolveTransport()).toThrow(/non valido/);
  });
});

describe('dry-run', () => {
  it('e attivo per default quando la variabile manca', () => {
    vi.stubEnv('WHATSAPP_DRY_RUN', '');
    expect(isDryRun()).toBe(true);
  });

  it('resta attivo su un valore scritto male', () => {
    // Il verso della condizione e deliberato: solo 'false' esatto spegne
    // la simulazione. 'FALSO', '0', 'no' lasciano il sistema al sicuro.
    for (const v of ['FALSO', '0', 'no', 'nope']) {
      vi.stubEnv('WHATSAPP_DRY_RUN', v);
      expect(isDryRun()).toBe(true);
    }
  });

  it('si disattiva solo con false esatto', () => {
    vi.stubEnv('WHATSAPP_DRY_RUN', 'FALSE');
    expect(isDryRun()).toBe(false);
  });

  it('non chiama nessun trasporto e non applica jitter', async () => {
    vi.stubEnv('WHATSAPP_TRANSPORT', 'waha');
    vi.stubEnv('WHATSAPP_DRY_RUN', 'true');
    const out = await sendText('+393514512070', 'ciao');

    expect(wahaText).not.toHaveBeenCalled();
    expect(cloudText).not.toHaveBeenCalled();
    expect(out).toEqual({
      messageId: null,
      transport: 'waha',
      dryRun: true,
      jitterAppliedMs: 0,
    });
  });
});

// 05/08 (Andrea) — CONTRATTO INVERTITO.
//
// Prima il kill switch ritornava { skippedReason } e cinque chiamanti
// su otto lo ignoravano: registravano "inviato", facevano avanzare lo
// stato, e il messaggio non ripartiva piu'. Adesso lancia, e chi
// tollera lo skip deve dichiararlo con allowSkip.
describe('kill switch', () => {
  it('LANCIA invece di ritornare uno skip silenzioso', async () => {
    armLiveSending('waha');
    vi.stubEnv('WHATSAPP_KILL_SWITCH', 'on');
    expect(isKillSwitchOn()).toBe(true);

    await expect(sendText('+393514512070', 'ciao')).rejects.toThrow(WhatsappSendSkipped);
    expect(wahaText).not.toHaveBeenCalled();
  });

  it('LANCIA anche su sendImage', async () => {
    armLiveSending('cloud');
    vi.stubEnv('WHATSAPP_KILL_SWITCH', 'on');
    await expect(
      sendImage({ to: '+393514512070', imageUrl: 'https://x/y.jpg' }),
    ).rejects.toThrow(WhatsappSendSkipped);
    expect(cloudImage).not.toHaveBeenCalled();
  });

  it('l errore porta con se il motivo, cosi chi lo cattura puo registrarlo', async () => {
    armLiveSending('waha');
    vi.stubEnv('WHATSAPP_KILL_SWITCH', 'on');
    await expect(sendText('+393514512070', 'ciao')).rejects.toMatchObject({
      name: 'WhatsappSendSkipped',
      reason: 'kill_switch',
    });
  });

  it('con allowSkip ritorna l esito invece di lanciare (percorso reserveAndSend)', async () => {
    armLiveSending('waha');
    vi.stubEnv('WHATSAPP_KILL_SWITCH', 'on');

    const out = await sendText('+393514512070', 'ciao', { allowSkip: true });
    expect(wahaText).not.toHaveBeenCalled();
    expect(out.skippedReason).toBe('kill_switch');
    expect(out.messageId).toBeNull();

    const img = await sendImage({
      to: '+393514512070',
      imageUrl: 'https://x/y.jpg',
      allowSkip: true,
    });
    expect(img.skippedReason).toBe('kill_switch');
  });

  it('il dry-run NON lancia: e una modalita progettata, non un blocco', async () => {
    vi.stubEnv('WHATSAPP_KILL_SWITCH', 'off');
    vi.stubEnv('WHATSAPP_DRY_RUN', 'true');
    const out = await sendText('+393514512070', 'ciao');
    expect(out.dryRun).toBe(true);
    expect(out.skippedReason).toBeUndefined();
  });
});

describe('instradamento', () => {
  it('con transport=waha chiama WAHA e non Meta', async () => {
    armLiveSending('waha');
    const p = sendText('+393514512070', 'ciao', { immediate: true });
    await vi.runAllTimersAsync();
    const out = await p;

    expect(wahaText).toHaveBeenCalledWith('+393514512070', 'ciao');
    expect(cloudText).not.toHaveBeenCalled();
    expect(out.messageId).toBe('waha-1');
    expect(out.transport).toBe('waha');
    expect(out.dryRun).toBe(false);
  });

  it('con transport=cloud chiama Meta e non WAHA', async () => {
    armLiveSending('cloud');
    const p = sendText('+393514512070', 'ciao', { immediate: true });
    await vi.runAllTimersAsync();
    const out = await p;

    expect(cloudText).toHaveBeenCalledWith('+393514512070', 'ciao');
    expect(wahaText).not.toHaveBeenCalled();
    expect(out.messageId).toBe('wamid.CLOUD');
  });

  it('sendImage passa url e caption al trasporto attivo', async () => {
    armLiveSending('waha');
    const p = sendImage({
      to: '+393514512070',
      imageUrl: 'https://cdn/x.jpg',
      caption: 'benvenuto',
      immediate: true,
    });
    await vi.runAllTimersAsync();
    await p;

    expect(wahaImage).toHaveBeenCalledWith({
      to: '+393514512070',
      imageUrl: 'https://cdn/x.jpg',
      caption: 'benvenuto',
      immediate: true,
    });
  });
});

describe('jitter', () => {
  it('sta sempre nella finestra 30-60s', () => {
    for (let i = 0; i < 200; i++) {
      const ms = pickJitterMs();
      expect(ms).toBeGreaterThanOrEqual(30_000);
      expect(ms).toBeLessThanOrEqual(60_000);
    }
  });

  it('viene applicato prima di un invio reale e riportato nell esito', async () => {
    armLiveSending('waha');
    const p = sendText('+393514512070', 'ciao'); // niente immediate

    // Prima che il timer scada, nessuna chiamata deve essere partita.
    expect(wahaText).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    const out = await p;

    expect(wahaText).toHaveBeenCalledOnce();
    expect(out.jitterAppliedMs).toBeGreaterThanOrEqual(30_000);
    expect(out.jitterAppliedMs).toBeLessThanOrEqual(60_000);
  });

  it('immediate lo salta (messaggi a cleaner e founder, non a ospiti)', async () => {
    armLiveSending('waha');
    const out = await sendText('+393514512070', 'brief', { immediate: true });
    expect(out.jitterAppliedMs).toBe(0);
    expect(wahaText).toHaveBeenCalledOnce();
  });
});
