/**
 * Email di invito alla piattaforma ospite.
 *
 * ─── Perché l'email, e perché è la strada più veloce ──────────────
 *
 * WhatsApp non ci lascia iniziare una conversazione: fuori dalla
 * finestra di 24h servono template approvati da Meta, che oggi non
 * esistono. L'email non ha finestre, non ha template, non ha
 * approvazioni — e l'export Chekin la contiene SEMPRE, anche quando il
 * telefono manca.
 *
 * Il percorso diventa:
 *
 *   email → l'ospite apre l'app → tocca "scrivi all'host" →
 *   il messaggio parte dal SUO telefono → la finestra 24h si apre da
 *   sola → da lì l'agente lavora libero.
 *
 * Il punto non è sostituire WhatsApp con l'email: è usare l'email per
 * far aprire WhatsApp all'ospite. È l'ospite che deve scrivere per
 * primo, e questo è esattamente ciò che Meta vuole.
 *
 * ─── Su cosa NON mettere in questa email ──────────────────────────
 *
 * Niente codici d'accesso nel corpo del messaggio. Un'email resta nella
 * casella per sempre e viene inoltrata; i codici stanno nell'app, dove
 * la loro visibilità è legata alle date del soggiorno.
 */

export type GuestInviteLanguage = 'it' | 'en';

export type GuestInviteInput = {
  guestFirstName?: string | null;
  propertyName: string;
  checkinAt: Date;
  checkoutAt: Date;
  /** URL completo /g/[token] — già firmato dal chiamante. */
  guestAppUrl: string;
  hostFirstName?: string | null;
  language?: string | null;
};

export type GuestInviteEmail = {
  subject: string;
  html: string;
  text: string;
  language: GuestInviteLanguage;
};

function normalize(lang?: string | null): GuestInviteLanguage {
  return lang?.trim().toLowerCase().startsWith('it') ? 'it' : 'en';
}

function formatDate(d: Date, lang: GuestInviteLanguage): string {
  return new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  }).format(d);
}

/** Escape per l'interpolazione in HTML: i nomi arrivano da terzi. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const COPY = {
  it: {
    subject: (property: string) => `Il tuo soggiorno a ${property} — tutto in un link`,
    hello: (nome: string | null) => (nome ? `Ciao ${nome},` : 'Ciao,'),
    intro: (property: string) =>
      `manca poco al tuo arrivo a ${property}. Abbiamo preparato una pagina con tutto quello che ti serve durante il soggiorno.`,
    dates: (a: string, b: string) => `Il tuo soggiorno: dal ${a} al ${b}.`,
    contains: 'Dentro trovi:',
    bullets: [
      'come arrivare e dove parcheggiare',
      'wifi e istruzioni della casa',
      'i nostri posti preferiti: spiagge, ristoranti, cosa fare',
      'servizi extra da prenotare con un tocco',
    ],
    cta: 'Apri la tua pagina',
    whatsapp:
      'Nella pagina trovi anche il pulsante per scriverci su WhatsApp: usalo per qualunque cosa, rispondiamo noi.',
    signoff: (host: string | null) => (host ? `A presto,\n${host}` : 'A presto!'),
    ps: 'Conserva questa email: il link ti servirà durante tutto il soggiorno.',
  },
  en: {
    subject: (property: string) => `Your stay at ${property} — everything in one link`,
    hello: (nome: string | null) => (nome ? `Hi ${nome},` : 'Hi,'),
    intro: (property: string) =>
      `your arrival at ${property} is coming up. We've put together a page with everything you'll need during your stay.`,
    dates: (a: string, b: string) => `Your stay: ${a} to ${b}.`,
    contains: "Here's what's inside:",
    bullets: [
      'how to get here and where to park',
      'wifi and house instructions',
      'our favourite spots: beaches, restaurants, things to do',
      'extra services you can book with one tap',
    ],
    cta: 'Open your page',
    whatsapp:
      "The page also has a button to message us on WhatsApp — use it for anything at all, we'll reply.",
    signoff: (host: string | null) => (host ? `See you soon,\n${host}` : 'See you soon!'),
    ps: "Keep this email: you'll need the link throughout your stay.",
  },
} as const;

export function buildGuestInviteEmail(input: GuestInviteInput): GuestInviteEmail {
  const lang = normalize(input.language);
  const c = COPY[lang];

  const nome = input.guestFirstName?.trim() || null;
  const host = input.hostFirstName?.trim() || null;
  const dal = formatDate(input.checkinAt, lang);
  const al = formatDate(input.checkoutAt, lang);

  const text = [
    c.hello(nome),
    '',
    c.intro(input.propertyName),
    '',
    c.dates(dal, al),
    '',
    c.contains,
    ...c.bullets.map((b) => `· ${b}`),
    '',
    `${c.cta}: ${input.guestAppUrl}`,
    '',
    c.whatsapp,
    '',
    c.signoff(host),
    '',
    `— ${c.ps}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="${lang}">
<body style="margin:0;padding:0;background:#f7f3ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1d2b3a;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">${esc(c.hello(nome))}</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">${esc(c.intro(input.propertyName))}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 24px;color:#45525f;">${esc(c.dates(dal, al))}</p>

    <p style="font-size:15px;line-height:1.6;margin:0 0 8px;font-weight:600;">${esc(c.contains)}</p>
    <ul style="font-size:15px;line-height:1.8;margin:0 0 28px;padding-left:20px;color:#45525f;">
      ${c.bullets.map((b) => `<li>${esc(b)}</li>`).join('\n      ')}
    </ul>

    <p style="margin:0 0 28px;">
      <a href="${esc(input.guestAppUrl)}" style="display:inline-block;background:#16324f;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:14px;font-size:16px;font-weight:700;">${esc(c.cta)}</a>
    </p>

    <p style="font-size:15px;line-height:1.6;margin:0 0 24px;color:#45525f;">${esc(c.whatsapp)}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 24px;white-space:pre-line;">${esc(c.signoff(host))}</p>
    <p style="font-size:13px;line-height:1.5;margin:0;color:#8a94a0;">${esc(c.ps)}</p>
  </div>
</body>
</html>`;

  return { subject: c.subject(input.propertyName), html, text, language: lang };
}
