import type { KitNotificationContext } from './cleaner-brief';

// Slice C — Email founder via Resend.
//
// 4 templates:
//   A. kit_proposed       → quando agent genera proposta (status=proposed)
//   B. kit_approved       → quando founder approva (status=approved)
//   C. cleaner_confirmed  → quando Karen risponde 👍 (cleanerAcceptedAt)
//   D. cleaner_uploaded_photo → quando Karen carica foto setup (cleanerPlacedAt)
//
// Tutti via Resend SMTP, from: noreply@premura.it, to: hosts.email del founder.
// Lazy import resend (non transitive di alcuni consumer).
// ─────────────────────────────────────────────────────────────

const FROM_ADDRESS = 'Premura <noreply@premura.it>';
const DEFAULT_BASE_URL = 'https://premura.it';

export type KitEmailKind =
  | 'kit_proposed'
  | 'kit_approved'
  | 'cleaner_confirmed'
  | 'cleaner_uploaded_photo';

export type SendEmailResult =
  | { sent: true; kind: KitEmailKind }
  | { sent: false; reason: string };

export async function sendKitEmail(
  kind: KitEmailKind,
  ctx: KitNotificationContext,
  options: { baseUrl?: string; photoUrl?: string | null } = {},
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'no_resend_api_key' };

  const baseUrl = options.baseUrl ?? process.env.NEXT_PUBLIC_BASE_URL ?? DEFAULT_BASE_URL;
  const tpl = renderTemplate(kind, ctx, baseUrl, options.photoUrl ?? null);

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: ctx.hostEmail,
      subject: tpl.subject,
      html: tpl.html,
    });
    return { sent: true, kind };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export function renderTemplate(
  kind: KitEmailKind,
  ctx: KitNotificationContext,
  baseUrl: string,
  photoUrl: string | null,
): { subject: string; html: string } {
  const kitUrl = `${baseUrl}/dashboard/kits/${ctx.kitId}`;
  const executeUrl = `${baseUrl}/dashboard/kits/${ctx.kitId}/execute`;
  const checkinFmt = formatCheckin(ctx.checkinAt);
  const hostName = ctx.hostFullName ?? 'host';
  const guestName = escapeHtml(ctx.guestFullName);
  const propertyName = escapeHtml(ctx.propertyName);
  const storyOneLine = ctx.storyteller ? escapeHtml(ctx.storyteller) : '';
  const totalEur = ctx.itemsTotalEur ? `€${ctx.itemsTotalEur}` : 'n/d';
  const budgetEur = `€${ctx.budgetTargetEur}`;

  if (kind === 'kit_proposed') {
    return {
      subject: `🎁 Nuovo kit pronto per approvazione: ${ctx.guestFullName} - ${ctx.propertyName}`,
      html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;color:#222;">
<p>Ciao ${escapeHtml(hostName)},</p>
<p>Premura ha generato una proposta kit per:</p>
<ul>
<li>Ospite: <strong>${guestName}</strong></li>
<li>Property: <strong>${propertyName}</strong></li>
<li>Check-in: <strong>${checkinFmt}</strong></li>
<li>Notti: <strong>${ctx.nights}</strong></li>
</ul>
${storyOneLine ? `<p><em>${storyOneLine}</em></p>` : ''}
<p>Budget: <strong>${totalEur}</strong> / ${budgetEur}</p>
<p style="margin-top:24px;"><a href="${kitUrl}" style="background:#c87f5a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Vai alla dashboard per approvare →</a></p>
<p style="margin-top:32px;color:#888;">— Premura</p>
</body></html>`,
    };
  }

  if (kind === 'kit_approved') {
    return {
      subject: `✅ Kit approvato — cosa devi ordinare per ${ctx.guestFullName}`,
      html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;color:#222;">
<p>Ciao ${escapeHtml(hostName)},</p>
<p>Hai approvato il kit per <strong>${guestName}</strong> (${propertyName}, check-in ${checkinFmt}).</p>
<p>Adesso devi piazzare gli ordini Amazon Business + Glovo + preparare i manuali. La pagina execute ti raggruppa tutto per fonte e ti tiene traccia con i checkmark.</p>
<p style="margin-top:24px;"><a href="${executeUrl}" style="background:#c87f5a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Apri la pagina execute →</a></p>
<p style="margin-top:32px;color:#888;">— Premura</p>
</body></html>`,
    };
  }

  if (kind === 'cleaner_confirmed') {
    return {
      subject: `👍 Karen ha confermato il kit per ${ctx.guestFullName}`,
      html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;color:#222;">
<p>Ciao ${escapeHtml(hostName)},</p>
<p>Karen ha confermato il brief WhatsApp per il kit di <strong>${guestName}</strong> (${propertyName}, check-in ${checkinFmt}).</p>
<p>Status kit: <strong>cleaner accepted</strong>. Aspettiamo ora la conferma ritiro + foto setup.</p>
<p style="margin-top:24px;"><a href="${kitUrl}" style="color:#c87f5a;">Apri il dettaglio kit →</a></p>
<p style="margin-top:32px;color:#888;">— Premura</p>
</body></html>`,
    };
  }

  // cleaner_uploaded_photo
  const photoBlock = photoUrl
    ? `<p style="margin:16px 0;"><img src="${escapeAttr(photoUrl)}" alt="setup kit" style="max-width:100%;border-radius:8px;" /></p>`
    : '<p>(foto allegata, apri il kit per vederla full size)</p>';
  return {
    subject: `📸 Foto setup pronta — kit ${ctx.guestFullName}`,
    html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;color:#222;">
<p>Ciao ${escapeHtml(hostName)},</p>
<p>Karen ha caricato la foto del setup per il kit di <strong>${guestName}</strong> (${propertyName}, check-in ${checkinFmt}).</p>
${photoBlock}
<p style="margin-top:24px;"><a href="${kitUrl}" style="color:#c87f5a;">Apri il dettaglio kit →</a></p>
<p style="margin-top:32px;color:#888;">— Premura</p>
</body></html>`,
  };
}

function formatCheckin(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
