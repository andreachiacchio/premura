import { type AiDisclosureCustom, normalizeLanguage, resolveAiDisclosure } from '@premura/shared';

// Contenuto FISSO del benvenuto per prenotazioni senza kit (go-live
// 1 agosto, decisione Andrea 29/07): benvenuto + link guest app +
// disclosure AI. Niente LLM: il primo messaggio che un ospite reale
// riceve deve essere verificabile parola per parola PRIMA che parta.
//
// Struttura (ordine deliberato):
//  1. Disclosure AI in testa — AI Act art. 50, applicabile dal 2 agosto
//     2026: e' il primo contatto automatico della conversazione, quindi
//     la disclosure e' dovuta e non negoziabile (outbound-guard rifiuta
//     il corpo se manca).
//  2. Benvenuto con nome ospite e data di arrivo.
//  3. Link alla guest app con i servizi — omesso se l'URL non e'
//     configurato: meglio nessun link che un link rotto.
//  4. Firma = NOME DELLA STRUTTURA (decisione blindata: l'ospite deve
//     pensare di parlare con l'host, mai con un brand terzo).
//
// NIENTE referente in loco (decisione Andrea 30/07): l'accoglienza
// fisica — chiavi, arrivo — e' gestita fuori da questo messaggio.

export type BookingWelcomeInput = {
  guestFirstName: string | null;
  guestFullName: string;
  propertyName: string;
  /** Data di check-in, formattata nella lingua dell'ospite. */
  checkinAt: Date;
  language: string | null;
  /** URL della guest app (servizi). Da env WELCOME_GUEST_APP_URL. */
  guestAppUrl: string | null;
  aiDisclosureCustom?: AiDisclosureCustom;
};

const DATE_FMT: Record<'it' | 'en', Intl.DateTimeFormat> = {
  it: new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Rome',
  }),
  en: new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Rome',
  }),
};

export function composeBookingWelcome(input: BookingWelcomeInput): string {
  const lang = normalizeLanguage(input.language);
  const disclosure = resolveAiDisclosure(input.aiDisclosureCustom ?? null, lang);
  const name = input.guestFirstName ?? input.guestFullName;
  const date = DATE_FMT[lang].format(input.checkinAt);

  const lines: string[] = [disclosure, ''];

  if (lang === 'it') {
    lines.push(
      `Ciao ${name}, benvenuto! Siamo felici di accoglierti a ${input.propertyName} da ${date}.`,
    );
    if (input.guestAppUrl) {
      lines.push(
        '',
        `Qui trovi tutto per il tuo soggiorno — informazioni sulla casa e i nostri servizi (tour in barca, transfer, chef a domicilio): ${input.guestAppUrl}`,
      );
    }
    lines.push('', 'A presto,', input.propertyName);
  } else {
    lines.push(
      `Hi ${name}, welcome! We're delighted to host you at ${input.propertyName} from ${date}.`,
    );
    if (input.guestAppUrl) {
      lines.push(
        '',
        `Here you'll find everything for your stay — house info and our local services (boat tours, transfers, private chef): ${input.guestAppUrl}`,
      );
    }
    lines.push('', 'See you soon,', input.propertyName);
  }

  return lines.join('\n');
}
