import type { WelcomeMessageCandidate } from './welcome-finder';

// Slice E — Welcome message generator.
//
// Strategia (decisa Andrea, Q5 spec):
//  - Template fisso IT/EN ben curato a mano per V1.
//  - Variabili: {firstName}, {propertyName}, {hostName}, {keyboxCode}, {cardMessage}.
//  - host_voice_profile NON usato in V1 (template solo). Voice profile
//    integration in slice future quando avremo voice profile estratto
//    affidabilmente da host con history WA.

export type WelcomeMessageInput = WelcomeMessageCandidate;

export type WelcomeMessageOutput = {
  text: string;
  language: 'it' | 'en';
  hasKeybox: boolean;
};

export function generateWelcomeMessage(input: WelcomeMessageInput): WelcomeMessageOutput {
  const language: 'it' | 'en' = input.guestLanguage === 'en' ? 'en' : 'it';
  const firstName = (input.guestFirstName ?? input.guestFullName.split(' ')[0] ?? '').trim();
  const hostName = (input.hostFullName ?? '').trim() || 'il tuo host';
  const propertyName = input.propertyName;
  const cardMessage =
    language === 'en'
      ? (input.cardMessageEn ?? input.cardMessage ?? '')
      : (input.cardMessage ?? '');
  const keyboxCode = input.keyboxCode ?? null;

  if (language === 'en') {
    return {
      language,
      hasKeybox: !!keyboxCode,
      text: buildEnglish({
        firstName,
        hostName,
        propertyName,
        keyboxCode,
        cardMessage,
      }),
    };
  }

  return {
    language,
    hasKeybox: !!keyboxCode,
    text: buildItalian({
      firstName,
      hostName,
      propertyName,
      keyboxCode,
      cardMessage,
    }),
  };
}

type Vars = {
  firstName: string;
  hostName: string;
  propertyName: string;
  keyboxCode: string | null;
  cardMessage: string;
};

function buildItalian(v: Vars): string {
  const lines: string[] = [];
  const greeting = v.firstName ? `Buongiorno ${v.firstName} ☀️` : 'Buongiorno ☀️';
  lines.push(greeting);
  lines.push('');
  lines.push(
    `${v.propertyName} ti aspetta. ${v.hostName} ha preparato un piccolo benvenuto — lo trovi sul tavolo all'arrivo.`,
  );
  if (v.keyboxCode) {
    lines.push('');
    lines.push(`Il codice della keybox è ${v.keyboxCode}.`);
  }
  if (v.cardMessage) {
    lines.push('');
    lines.push(`«${v.cardMessage}»`);
  }
  lines.push('');
  lines.push('Per qualsiasi cosa, scrivi qui. Buon soggiorno.');
  lines.push(`— ${v.hostName} via Premura`);
  return lines.join('\n');
}

function buildEnglish(v: Vars): string {
  const lines: string[] = [];
  const greeting = v.firstName ? `Good morning ${v.firstName} ☀️` : 'Good morning ☀️';
  lines.push(greeting);
  lines.push('');
  lines.push(
    `${v.propertyName} is ready for you. ${v.hostName} prepared a small welcome — you'll find it on the table when you arrive.`,
  );
  if (v.keyboxCode) {
    lines.push('');
    lines.push(`The keybox code is ${v.keyboxCode}.`);
  }
  if (v.cardMessage) {
    lines.push('');
    lines.push(`«${v.cardMessage}»`);
  }
  lines.push('');
  lines.push('For anything at all, just message here. Have a wonderful stay.');
  lines.push(`— ${v.hostName} via Premura`);
  return lines.join('\n');
}
