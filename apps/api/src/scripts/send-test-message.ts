import { config as loadEnv } from 'dotenv';

// Verifica tecnica Fly -> tunnel -> WAHA (decisione Andrea 29/07):
// un singolo sendText dal SISTEMA (non da locale) al numero del founder.
// Nessuna prenotazione, nessuno slot outbound_sends: non e' un messaggio
// a un ospite, e' un ping di infrastruttura.
//
// Uso (da Fly, dopo il deploy):
//
//   fly ssh console --config apps/api/fly.toml --process-group worker \
//     -C "pnpm exec tsx src/scripts/send-test-message.ts +393383963307 'Premura è online'"
//
// Passa dal transport, quindi rispetta kill switch e DRY_RUN: con
// WHATSAPP_DRY_RUN diverso da 'false' stampa l'esito simulato e non
// chiama WAHA. E' voluto — lo script non puo' aggirare i paracadute.
//
// Exit code: 0 inviato (o simulato), 1 errore o argomenti mancanti.

loadEnv({ path: '.env.local' });

const [phone, ...textParts] = process.argv.slice(2);
const text = textParts.join(' ');

if (!phone || !text) {
  console.error('Uso: tsx send-test-message.ts <numero E.164> <testo...>');
  process.exit(1);
}

// Dynamic import DOPO loadEnv: il transport legge process.env a ogni
// chiamata, ma vale la stessa prudenza di manual-poll.ts.
const { sendText, resolveTransport, isDryRun, isKillSwitchOn } = await import(
  '@premura/integrations'
);

console.log(
  `[test-send] transport=${resolveTransport()} dryRun=${isDryRun()} killSwitch=${isKillSwitchOn()}`,
);

try {
  // immediate: e' un ping al founder, non un messaggio a un ospite —
  // il jitter anti-raffica qui sarebbe solo un minuto di attesa inutile.
  const out = await sendText(phone, text, { immediate: true });
  if (out.skippedReason) {
    console.log(`[test-send] BLOCCATO da ${out.skippedReason}. Nessun invio.`);
    process.exit(0);
  }
  if (out.dryRun) {
    console.log('[test-send] SIMULATO (WHATSAPP_DRY_RUN attivo). Nessuna chiamata a WAHA.');
    process.exit(0);
  }
  console.log(`[test-send] INVIATO via ${out.transport}. messageId=${out.messageId}`);
  process.exit(0);
} catch (err) {
  console.error('[test-send] ERRORE:', err instanceof Error ? err.message : err);
  process.exit(1);
}
