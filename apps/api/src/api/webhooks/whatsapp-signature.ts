import { createHmac, timingSafeEqual } from 'node:crypto';

// Verifica HMAC SHA-256 per webhook WhatsApp Cloud API.
// Meta firma il body raw con il WHATSAPP_APP_SECRET e mette il digest hex
// nell'header X-Hub-Signature-256, prefisso "sha256=".
//
// Questa funzione e' pura (input -> bool) per essere unit-testabile senza
// HTTP server. Il chiamante Fastify fornisce rawBody (Buffer del JSON
// originale, NON il parsed) e l'header come ricevuto.
//
// Compare timing-safe per evitare leak via comparison timing.
export function verifyMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const expectedHex = signatureHeader.slice('sha256='.length);

  // Hex valido = lunghezza 64 char (32 byte * 2). Reject early per evitare
  // Buffer.from che farebbe coercion silenziosa su input malformato.
  if (expectedHex.length !== 64 || !/^[0-9a-f]{64}$/i.test(expectedHex)) {
    return false;
  }

  const computedHex = createHmac('sha256', appSecret).update(rawBody).digest('hex');

  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const computedBuf = Buffer.from(computedHex, 'hex');
  if (expectedBuf.length !== computedBuf.length) return false;

  return timingSafeEqual(expectedBuf, computedBuf);
}
