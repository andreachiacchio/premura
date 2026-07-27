import { describe, expect, it } from 'vitest';
// Percorso diretto e non il barrel: consent-ip è server-only
// (node:crypto) e resta fuori da @premura/shared per non finire nel
// bundle browser di Next.
import { CONSENT_IP_PEPPER_VERSION, fingerprintIp } from '../src/consent-ip';

const PEPPER = 'pepper-di-test-non-usare-in-produzione';

describe('consent-ip — impronta IP non reversibile', () => {
  it('produce un HMAC esadecimale a 64 caratteri', () => {
    const out = fingerprintIp('93.44.101.7', PEPPER);
    expect(out).not.toBeNull();
    expect(out?.ipHmac).toMatch(/^[0-9a-f]{64}$/);
    expect(out?.ipPepperVersion).toBe(CONSENT_IP_PEPPER_VERSION);
  });

  it('è deterministico: stesso IP e stesso pepper → stesso hash', () => {
    expect(fingerprintIp('93.44.101.7', PEPPER)?.ipHmac).toBe(
      fingerprintIp('93.44.101.7', PEPPER)?.ipHmac,
    );
  });

  it('IP diversi producono hash diversi', () => {
    expect(fingerprintIp('93.44.101.7', PEPPER)?.ipHmac).not.toBe(
      fingerprintIp('93.44.101.8', PEPPER)?.ipHmac,
    );
  });

  it('il pepper cambia il risultato: senza segreto la tabella precalcolata non serve', () => {
    // È la proprietà che rende l'impronta non invertibile da chi non ha
    // il pepper. Se un giorno l'HMAC venisse sostituito da uno sha256
    // semplice, questo test cade.
    const a = fingerprintIp('93.44.101.7', 'pepper-A')?.ipHmac;
    const b = fingerprintIp('93.44.101.7', 'pepper-B')?.ipHmac;
    expect(a).not.toBe(b);
  });

  it('senza pepper non scrive nulla invece di degradare a un hash debole', () => {
    expect(fingerprintIp('93.44.101.7', undefined)).toBeNull();
    expect(fingerprintIp('93.44.101.7', '')).toBeNull();
    expect(fingerprintIp('93.44.101.7', '   ')).toBeNull();
  });

  it('senza IP non scrive nulla', () => {
    expect(fingerprintIp(null, PEPPER)).toBeNull();
    expect(fingerprintIp(undefined, PEPPER)).toBeNull();
    expect(fingerprintIp('', PEPPER)).toBeNull();
    expect(fingerprintIp('  ', PEPPER)).toBeNull();
  });

  it('normalizza gli spazi ai bordi dell’IP', () => {
    expect(fingerprintIp(' 93.44.101.7 ', PEPPER)?.ipHmac).toBe(
      fingerprintIp('93.44.101.7', PEPPER)?.ipHmac,
    );
  });

  it('funziona anche con IPv6', () => {
    expect(fingerprintIp('2001:0db8:85a3::8a2e:0370:7334', PEPPER)?.ipHmac).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });
});
