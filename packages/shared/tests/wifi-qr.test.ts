import { describe, expect, it } from 'vitest';
import { buildWifiQrPayload, buildWifiSection, escapeWifiValue } from '../src/wifi-qr';

describe('payload QR WiFi', () => {
  it('costruisce il formato standard riconosciuto da iOS e Android', () => {
    expect(buildWifiQrPayload({ ssid: 'Villa Cristina wifi', password: 'Praiano2024' })).toBe(
      'WIFI:T:WPA;S:Villa Cristina wifi;P:Praiano2024;;',
    );
  });

  describe('escape dei caratteri strutturali', () => {
    // Se questo escape salta, un QR con password contenente ';' porta
    // l'ospite a un errore muto che sembra un problema del suo telefono.
    it.each([
      [';', '\\;'],
      [':', '\\:'],
      [',', '\\,'],
      ['"', '\\"'],
      ['\\', '\\\\'],
    ])('escapa %s', (input, atteso) => {
      expect(escapeWifiValue(input)).toBe(atteso);
    });

    it('password con punto e virgola non tronca il payload', () => {
      const payload = buildWifiQrPayload({ ssid: 'Villa', password: 'Pra;iano2024' });
      expect(payload).toBe('WIFI:T:WPA;S:Villa;P:Pra\\;iano2024;;');

      // Un lettore separa i campi sui ';' NON preceduti da backslash.
      // Il ';' dentro la password è escapato, quindi non deve creare un
      // campo in più rispetto a una password senza caratteri speciali.
      const campiVeri = (s: string) => s.split(/(?<!\\);/).filter(Boolean);
      expect(campiVeri(payload ?? '')).toEqual(
        campiVeri('WIFI:T:WPA;S:Villa;P:Praiano2024;;').map((c) =>
          c === 'P:Praiano2024' ? 'P:Pra\\;iano2024' : c,
        ),
      );
    });

    it('SSID con due punti resta integro', () => {
      expect(buildWifiQrPayload({ ssid: 'Villa: Cristina', password: 'x' })).toContain(
        'S:Villa\\: Cristina',
      );
    });

    it('non tocca i caratteri innocui', () => {
      expect(escapeWifiValue('Praiano2024!')).toBe('Praiano2024!');
      expect(escapeWifiValue('Villa Cristina wifi')).toBe('Villa Cristina wifi');
    });
  });

  describe('casi limite', () => {
    it('senza SSID non produce nulla: meglio nessun QR che uno malformato', () => {
      expect(buildWifiQrPayload({ ssid: '', password: 'x' })).toBeNull();
      expect(buildWifiQrPayload({ ssid: '   ', password: 'x' })).toBeNull();
    });

    it('rete aperta: omette il campo password invece di lasciarlo vuoto', () => {
      const payload = buildWifiQrPayload({ ssid: 'Free WiFi', password: null });
      expect(payload).toBe('WIFI:T:nopass;S:Free WiFi;;');
      expect(payload).not.toContain('P:');
    });

    it('rete nascosta aggiunge H:true', () => {
      expect(buildWifiQrPayload({ ssid: 'Villa', password: 'x', hidden: true })).toContain(
        'H:true',
      );
    });

    it('accetta un tipo di autenticazione diverso', () => {
      expect(buildWifiQrPayload({ ssid: 'Villa', password: 'x', authType: 'WEP' })).toContain(
        'T:WEP',
      );
    });
  });
});

describe('sezione WiFi — stessa finestra dei codici d’accesso', () => {
  const WIFI = { ssid: 'Villa Cristina wifi', password: 'Praiano2024', notes: 'Router in salotto' };

  it('dentro la finestra serve credenziali e QR', () => {
    const s = buildWifiSection({ visible: true, wifi: WIFI });
    expect(s.visible).toBe(true);
    expect(s.ssid).toBe('Villa Cristina wifi');
    expect(s.password).toBe('Praiano2024');
    expect(s.qrPayload).toContain('S:Villa Cristina wifi');
  });

  it('FUORI dalla finestra i valori sono null, non nascosti', () => {
    // Il payload di un Server Component finisce nel sorgente della
    // pagina: "c'è ma non lo mostro" equivale a mostrarlo.
    const s = buildWifiSection({ visible: false, wifi: WIFI });
    expect(s.visible).toBe(false);
    expect(s.ssid).toBeNull();
    expect(s.password).toBeNull();
    expect(s.qrPayload).toBeNull();
    expect(JSON.stringify(s)).not.toContain('Praiano2024');
  });

  it('property senza WiFi configurato non rompe nulla', () => {
    const s = buildWifiSection({ visible: true, wifi: null });
    expect(s.visible).toBe(false);
    expect(s.qrPayload).toBeNull();
  });

  it('SSID presente ma password mancante: QR di rete aperta', () => {
    const s = buildWifiSection({ visible: true, wifi: { ssid: 'Villa', password: null } });
    expect(s.ssid).toBe('Villa');
    expect(s.password).toBeNull();
    expect(s.qrPayload).toContain('T:nopass');
  });

  it('i valori vengono dai dati della property, non da costanti', () => {
    // Due property diverse producono QR diversi: nessun hardcoding.
    const a = buildWifiSection({ visible: true, wifi: { ssid: 'Rete A', password: 'aaa' } });
    const b = buildWifiSection({ visible: true, wifi: { ssid: 'Rete B', password: 'bbb' } });
    expect(a.qrPayload).not.toBe(b.qrPayload);
  });
});
