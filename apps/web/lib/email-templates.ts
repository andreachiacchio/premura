// Slice 6.5.1 — Template email Premura.
//
// Template HTML + plaintext per email transazionali. Identita' visiva
// allineata slice 10a (palette ivory/ink/terracotta, font serif Fraunces
// per headlines, font sans Inter per body, radii generosi).
//
// Magic link template: incollare il blocco HTML in Supabase Auth >
// Email Templates > Magic Link > Custom HTML, sostituendo le
// variabili {{ .Email }} {{ .Token }} {{ .ConfirmationURL }} di
// default Supabase con quelle Premura.

export type MagicLinkTemplateInput = {
  recipientName?: string; // se conosciamo l'host, "Andrea"
  confirmationUrl: string;
  // Override visivi per branding evolutivo. Default Premura.
  brandName?: string;
  fromAddress?: string;
};

const TERRACOTTA = '#C65D3A';
const TERRACOTTA_2 = '#A84A2B';
const INK = '#1F3A4D';
const INK_SOFT = '#4A5F72';
const INK_MUTE = '#8A98A5';
const IVORY = '#F5EFE4';
const PAPER = '#FDFAF3';
const LINE = '#E5DCC8';

export function buildMagicLinkHtml(input: MagicLinkTemplateInput): string {
  const greeting = input.recipientName ? `Ciao ${input.recipientName},` : 'Ciao,';
  const brandName = input.brandName ?? 'Premura';

  return `<!DOCTYPE html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Accedi a ${brandName}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${IVORY};font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;color:${INK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${IVORY};padding:40px 20px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background-color:${PAPER};border:1px solid ${LINE};border-radius:24px;padding:40px 32px;">
            <tr>
              <td style="padding-bottom:24px;">
                <p style="margin:0;color:${INK_MUTE};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;">${brandName}</p>
                <h1 style="margin:8px 0 0 0;font-family:'Fraunces','Georgia',serif;font-weight:500;font-size:32px;line-height:1.1;letter-spacing:-0.025em;color:${INK};">
                  Accedi al tuo concierge.
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:24px;">
                <p style="margin:0;font-size:16px;line-height:1.55;color:${INK_SOFT};">
                  ${greeting} ti aspetta la tua dashboard. Clicca sotto per
                  entrare. Il link funziona una volta sola e scade tra
                  un'ora.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:32px;">
                <a href="${input.confirmationUrl}" style="display:inline-block;background-color:${TERRACOTTA};color:${PAPER};text-decoration:none;font-size:15px;font-weight:500;padding:14px 32px;border-radius:9999px;box-shadow:0 2px 8px rgba(31,58,77,0.06),0 12px 28px rgba(31,58,77,0.06);">
                  Entra in ${brandName}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:8px;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:${INK_MUTE};">
                  Se il bottone non funziona, copia e incolla questo
                  indirizzo nel browser:
                </p>
                <p style="margin:8px 0 0 0;font-size:12px;word-break:break-all;color:${INK_SOFT};">
                  <a href="${input.confirmationUrl}" style="color:${TERRACOTTA_2};text-decoration:underline;">${input.confirmationUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding-top:32px;border-top:1px solid ${LINE};">
                <p style="margin:16px 0 0 0;font-size:13px;line-height:1.5;color:${INK_MUTE};">
                  Non hai richiesto questa email? Ignorala. Senza il clic
                  niente cambia, nessuno entra.
                </p>
                <p style="margin:24px 0 0 0;font-size:12px;color:${INK_MUTE};text-align:center;">
                  ${brandName} — il concierge che non dorme mai.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildMagicLinkText(input: MagicLinkTemplateInput): string {
  const brandName = input.brandName ?? 'Premura';
  const greeting = input.recipientName ? `Ciao ${input.recipientName},` : 'Ciao,';
  return [
    `Accedi a ${brandName}.`,
    '',
    `${greeting} ti aspetta la tua dashboard.`,
    "Clicca o copia il link qui sotto per entrare. Funziona una volta sola e scade tra un'ora.",
    '',
    input.confirmationUrl,
    '',
    'Non hai richiesto questa email? Ignorala. Senza il clic niente cambia, nessuno entra.',
    '',
    `— ${brandName}, il concierge che non dorme mai.`,
  ].join('\n');
}

export const MAGIC_LINK_SUBJECT = 'Accedi a Premura';
