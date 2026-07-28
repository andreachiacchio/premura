import { describe, expect, it } from 'vitest';
import {
  WHATSAPP_WINDOW_HOURS,
  computeSendability,
  computeWhatsappWindow,
} from '../src/whatsapp-window';

const ORA = new Date('2026-07-28T15:00:00Z');
const oreFa = (h: number) => new Date(ORA.getTime() - h * 3_600_000);
const minutiFa = (m: number) => new Date(ORA.getTime() - m * 60_000);

describe('finestra WhatsApp 24h', () => {
  it('aperta se l’ospite ha scritto poco fa', () => {
    const w = computeWhatsappWindow(oreFa(2), ORA);
    expect(w.state).toBe('open');
    expect(w.canSendFreeForm).toBe(true);
    expect(w.remainingMinutes).toBe(22 * 60);
  });

  it('in chiusura nelle ultime 2 ore', () => {
    const w = computeWhatsappWindow(oreFa(23), ORA);
    expect(w.state).toBe('closing_soon');
    expect(w.canSendFreeForm).toBe(true);
  });

  it('chiusa dopo 24h esatte', () => {
    const w = computeWhatsappWindow(oreFa(WHATSAPP_WINDOW_HOURS), ORA);
    expect(w.state).toBe('closed');
    expect(w.canSendFreeForm).toBe(false);
    expect(w.remainingMinutes).toBe(0);
  });

  it('chiusa il giorno dopo', () => {
    expect(computeWhatsappWindow(oreFa(40), ORA).state).toBe('closed');
  });

  it('mai aperta se l’ospite non ha mai scritto', () => {
    const w = computeWhatsappWindow(null, ORA);
    expect(w.state).toBe('never_opened');
    expect(w.expiresAt).toBeNull();
    expect(w.canSendFreeForm).toBe(false);
  });

  it('una data illeggibile vale come mai aperta: in dubbio non si promette', () => {
    expect(computeWhatsappWindow('non-una-data', ORA).state).toBe('never_opened');
  });

  it('accetta anche una stringa ISO', () => {
    expect(computeWhatsappWindow(oreFa(1).toISOString(), ORA).state).toBe('open');
  });

  it('un minuto prima della scadenza è ancora aperta', () => {
    const w = computeWhatsappWindow(minutiFa(24 * 60 - 1), ORA);
    expect(w.canSendFreeForm).toBe(true);
    expect(w.remainingMinutes).toBe(1);
  });
});

describe('cosa può davvero partire — messaggi onesti per l’host', () => {
  it('senza numero: lo dice invece di invitare ad attivare l’agente', () => {
    const s = computeSendability({ hasPhone: false, hasApprovedTemplate: false, now: ORA });
    expect(s.canSendNow).toBe(false);
    expect(s.blocker).toBe('no_phone');
    expect(s.hostMessage).toContain('numero');
  });

  it('IL CASO DEL BANNER: numero presente, finestra mai aperta, nessun template', () => {
    // È esattamente la situazione odierna del progetto: il numero c'è,
    // l'host crede che l'agente sia attivo, ma l'invio verrebbe
    // rifiutato con errore 131047 e nessuno glielo dice.
    const s = computeSendability({
      hasPhone: true,
      lastInboundAt: null,
      hasApprovedTemplate: false,
      now: ORA,
    });

    expect(s.canSendNow).toBe(false);
    expect(s.blocker).toBe('window_closed_no_template');
    expect(s.hostMessage).toContain('non ha ancora scritto');
    // Deve indicare la via d'uscita, non solo il problema.
    expect(s.hostMessage).toContain('email');
  });

  it('finestra scaduta senza template: avvisa che l’invio verrebbe rifiutato', () => {
    const s = computeSendability({
      hasPhone: true,
      lastInboundAt: oreFa(30),
      hasApprovedTemplate: false,
      now: ORA,
    });
    expect(s.canSendNow).toBe(false);
    expect(s.hostMessage).toContain('rifiutato');
  });

  it('finestra aperta: si può scrivere, con il tempo residuo', () => {
    const s = computeSendability({
      hasPhone: true,
      lastInboundAt: oreFa(3),
      hasApprovedTemplate: false,
      now: ORA,
    });
    expect(s.canSendNow).toBe(true);
    expect(s.blocker).toBeNull();
    expect(s.hostMessage).toContain('21h');
  });

  it('in chiusura: segnala il poco tempo rimasto', () => {
    const s = computeSendability({
      hasPhone: true,
      lastInboundAt: minutiFa(23 * 60 + 30),
      hasApprovedTemplate: false,
      now: ORA,
    });
    expect(s.canSendNow).toBe(true);
    expect(s.hostMessage).toContain('30m');
  });

  it('con un template approvato si può iniziare anche a finestra chiusa', () => {
    const s = computeSendability({
      hasPhone: true,
      lastInboundAt: null,
      hasApprovedTemplate: true,
      now: ORA,
    });
    expect(s.canSendNow).toBe(true);
    expect(s.hostMessage).toContain('template');
  });

  it('il numero manca: ha la precedenza su tutto il resto', () => {
    const s = computeSendability({
      hasPhone: false,
      lastInboundAt: oreFa(1),
      hasApprovedTemplate: true,
      now: ORA,
    });
    expect(s.blocker).toBe('no_phone');
  });
});
