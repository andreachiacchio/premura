import { findStaleSetups } from '@premura/agents';
import type { Database } from '@premura/db';
import { sendText } from '@premura/integrations';
import pino from 'pino';

// Slice E — Edge case alerts welcome message.
//
// 08:00: foto cleaner manca → WA reminder cleaner + email founder soft alert.
// 09:00: kit non set_up entro 09:00 → email founder "kit incompleto" escalation.
//
// Una volta al giorno per kit (lo specifico tick 08:00/09:00 da' idempotency
// naturale: il prossimo tick utile e' domani).

const logger = pino({
  name: 'welcome-stale-alerts',
  level: process.env.LOG_LEVEL ?? 'info',
});

const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL ?? 'andrea.chiacchio@premura.it';

export async function runEarlyStaleCheck(
  db: Database,
  now: Date = new Date(),
): Promise<{
  candidates: number;
  cleanerAlerted: number;
  founderNotified: boolean;
}> {
  // 08:00: photo missing → cleaner WA reminder + founder soft email.
  const stale = await findStaleSetups(db, 8, now);
  if (stale.length === 0) {
    return { candidates: 0, cleanerAlerted: 0, founderNotified: false };
  }

  let cleanerAlerted = 0;
  for (const item of stale) {
    if (!item.cleanerPhone) continue;
    try {
      const guestName = item.guestFirstName ?? "l'ospite";
      const text = `Buongiorno! Ricordo gentile: oggi check-in di ${guestName} a ${item.propertyName}. Quando puoi, completa il setup e carica la foto del kit. Grazie 💛`;
      await sendText(item.cleanerPhone, text);
      cleanerAlerted++;
    } catch (err) {
      logger.error(
        { err, kitId: item.kitId, propertyId: item.propertyId },
        'cleaner reminder send failed',
      );
    }
  }

  const founderNotified = await notifyFounder({
    subject: `Premura — Foto setup mancante (${stale.length})`,
    title: 'Foto cleaner mancante alle 08:00',
    items: stale,
    severity: 'soft',
  });

  return { candidates: stale.length, cleanerAlerted, founderNotified };
}

export async function runEscalationCheck(
  db: Database,
  now: Date = new Date(),
): Promise<{
  candidates: number;
  founderNotified: boolean;
}> {
  // 09:00: kit not set_up → email founder escalation.
  const stale = await findStaleSetups(db, 9, now);
  if (stale.length === 0) {
    return { candidates: 0, founderNotified: false };
  }

  const founderNotified = await notifyFounder({
    subject: `Premura — Kit incompleto alle 09:00 (${stale.length})`,
    title: 'Kit non set_up entro le 09:00',
    items: stale,
    severity: 'escalation',
  });

  return { candidates: stale.length, founderNotified };
}

async function notifyFounder(input: {
  subject: string;
  title: string;
  items: Array<{
    kitId: string;
    propertyName: string;
    guestFirstName: string | null;
    checkinAt: Date;
    kitStatus: string;
    photoUploaded: boolean;
    cleanerName: string | null;
  }>;
  severity: 'soft' | 'escalation';
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn(
      { subject: input.subject, items: input.items.length },
      'no RESEND_API_KEY: founder email skipped',
    );
    return false;
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const rows = input.items
      .map(
        (i) =>
          `<tr><td>${escapeHtml(i.propertyName)}</td><td>${escapeHtml(i.guestFirstName ?? '—')}</td><td>${escapeHtml(i.checkinAt.toISOString().slice(0, 16).replace('T', ' '))}</td><td>${escapeHtml(i.kitStatus)}</td><td>${i.photoUploaded ? '✓' : '✗'}</td><td>${escapeHtml(i.cleanerName ?? '—')}</td></tr>`,
      )
      .join('');
    const severityNote =
      input.severity === 'escalation'
        ? '<p><strong>⚠️ Escalation:</strong> il kit non è in stato <code>set_up</code> alle 09:00. Welcome message ritardato finché non viene completato.</p>'
        : '<p>Soft alert: foto cleaner non ancora caricata alle 08:00. Cleaner ha ricevuto reminder via WhatsApp.</p>';
    const body = `<!doctype html><html><body style="font-family:sans-serif;">
<h2>${escapeHtml(input.title)}</h2>
${severityNote}
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
  <thead><tr><th>Property</th><th>Guest</th><th>Check-in</th><th>Kit status</th><th>Photo</th><th>Cleaner</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p>Apri <a href="https://premura.it/dashboard/kits">dashboard kit</a> per intervenire.</p>
</body></html>`;
    await resend.emails.send({
      from: 'Premura <noreply@premura.it>',
      to: OPERATOR_EMAIL,
      subject: input.subject,
      html: body,
    });
    return true;
  } catch (err) {
    logger.error({ err, subject: input.subject }, 'founder email send failed');
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
