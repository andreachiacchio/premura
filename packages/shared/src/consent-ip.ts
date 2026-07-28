import { createHmac } from 'node:crypto';

/**
 * Impronta non reversibile dell'IP per il registro consensi.
 *
 * ─── MODULO SERVER-ONLY ───────────────────────────────────────────
 *
 * Per via di `node:crypto` questo file NON è esportato dal barrel
 * `@premura/shared`: quel barrel viene raggiunto dai client component
 * (lib/types.ts → dashboard/BookingRow.tsx) e il build di Next
 * fallirebbe con UnhandledSchemeError anche senza mai chiamare la
 * funzione. Importalo dal percorso diretto:
 *
 *   import { fingerprintIp } from '@premura/shared/src/consent-ip';
 *
 * ─── Perché non un semplice SHA-256 ───────────────────────────────
 *
 * Lo spazio degli indirizzi IPv4 è di ~4,3 miliardi di valori: una
 * tabella precalcolata di tutti i loro hash si costruisce in poco
 * tempo e si consulta istantaneamente. Un `sha256(ip)` è quindi
 * invertibile, cioè resta un dato personale — con l'aggravante di
 * sembrare anonimizzato. Il Considerando 26 GDPR guarda ai mezzi
 * ragionevolmente utilizzabili per re-identificare: qui bastano un
 * portatile e mezz'ora.
 *
 * Con HMAC e un segreto che non lascia mai il server, la tabella
 * precalcolata non è costruibile senza il segreto stesso.
 *
 * ─── Se il pepper non è configurato ───────────────────────────────
 *
 * Si restituisce null e non si scrive nulla. È deliberato: un ambiente
 * senza segreto non deve degradare silenziosamente a un hash debole.
 * Il consenso resta provabile con testo versionato + timestamp +
 * canale, che è ciò che conta davvero in contestazione.
 */

/** Versione corrente del pepper. Da incrementare a ogni rotazione. */
export const CONSENT_IP_PEPPER_VERSION = 'v1';

export type ConsentIpFingerprint = {
  ipHmac: string;
  ipPepperVersion: string;
} | null;

/**
 * @param ip        indirizzo grezzo (x-forwarded-for già normalizzato)
 * @param pepper    segreto da env CONSENT_IP_PEPPER; se assente → null
 */
export function fingerprintIp(
  ip: string | null | undefined,
  pepper: string | null | undefined = process.env.CONSENT_IP_PEPPER,
): ConsentIpFingerprint {
  if (!ip || ip.trim().length === 0) return null;
  if (!pepper || pepper.trim().length === 0) return null;

  return {
    ipHmac: createHmac('sha256', pepper).update(ip.trim()).digest('hex'),
    ipPepperVersion: CONSENT_IP_PEPPER_VERSION,
  };
}
