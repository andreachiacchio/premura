// Messaggio pronto da incollare nell'inbox Booking/Airbnb quando il
// numero dell'ospite non c'e' (livello L1 del principio di onboarding,
// CONTEXT.md §5). Lo incolla l'HOST a mano: zero automazione sulle
// inbox delle piattaforme, ToS salvi.
//
// Onesta' sulle promesse: finche' il gate dei codici sulla guest app
// non esiste, il messaggio chiede all'ospite di RISPONDERE col numero
// — una richiesta mantenibile oggi — e il link all'app compare solo se
// l'URL e' configurato (mai link rotti). Quando il gate L1 sara' vivo,
// il testo evolvera' in "apri l'app e lascia il numero per i codici".
//
// Firma = nome della struttura (decisione blindata).

import { normalizeLanguage } from '@premura/shared';

export type GuestInviteInput = {
  guestFirstName: string | null;
  guestFullName: string;
  propertyName: string;
  language: string | null;
  guestAppUrl: string | null;
};

export function composeGuestInvite(input: GuestInviteInput): string {
  const lang = normalizeLanguage(input.language);
  const rawName = input.guestFirstName ?? input.guestFullName;
  const name = rawName.trim();
  const lines: string[] = [];

  if (lang === 'it') {
    lines.push(
      `Ciao${name ? ` ${name}` : ''}! Stiamo preparando tutto per il tuo soggiorno a ${input.propertyName}.`,
    );
    if (input.guestAppUrl) {
      lines.push(
        '',
        `Qui trovi le informazioni sulla casa e i nostri servizi (tour, transfer, chef): ${input.guestAppUrl}`,
      );
    }
    lines.push(
      '',
      'Se vuoi assistenza su WhatsApp durante il soggiorno (arrivo, consigli, qualsiasi cosa), rispondi qui con il tuo numero.',
      '',
      input.propertyName,
    );
  } else {
    lines.push(
      `Hi${name ? ` ${name}` : ''}! We're getting everything ready for your stay at ${input.propertyName}.`,
    );
    if (input.guestAppUrl) {
      lines.push(
        '',
        `Here you'll find the house info and our local services (tours, transfers, private chef): ${input.guestAppUrl}`,
      );
    }
    lines.push(
      '',
      "If you'd like assistance on WhatsApp during your stay (arrival, tips, anything you need), just reply here with your phone number.",
      '',
      input.propertyName,
    );
  }

  return lines.join('\n');
}
