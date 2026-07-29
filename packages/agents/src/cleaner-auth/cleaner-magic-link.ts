import { type Database, cleaners } from '@premura/db';
import { sendText } from '@premura/integrations';
import { eq } from 'drizzle-orm';
import { signCleanerToken } from './cleaner-token';

// Slice D — Magic link cleaner via WhatsApp.
//
// Workflow:
//  1. Host (o backend) chiama sendCleanerMagicLink(db, cleanerId).
//  2. Genera token signed (TTL 30 giorni, riusabile).
//  3. Compose messaggio italiano + link assoluto https://premura.it/c/{token}.
//  4. Invio via Meta Cloud API outbound al numero cleaner.

export type SendMagicLinkResult =
  // messageId null = invio simulato (WHATSAPP_DRY_RUN) o kill switch.
  | { status: 'sent'; messageId: string | null; url: string }
  | { status: 'skipped_no_cleaner' }
  | { status: 'send_error'; error: string };

export async function sendCleanerMagicLink(
  db: Database,
  cleanerId: string,
  options: { baseUrl?: string } = {},
): Promise<SendMagicLinkResult> {
  const [cleaner] = await db
    .select({
      id: cleaners.id,
      fullName: cleaners.fullName,
      whatsappNumber: cleaners.whatsappNumber,
      languagePreferred: cleaners.languagePreferred,
    })
    .from(cleaners)
    .where(eq(cleaners.id, cleanerId))
    .limit(1);
  if (!cleaner) return { status: 'skipped_no_cleaner' };

  const baseUrl = options.baseUrl ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'https://premura.it';
  const token = signCleanerToken(cleaner.id);
  const url = `${baseUrl}/c/${token}`;

  const firstName = cleaner.fullName.split(' ')[0] ?? cleaner.fullName;
  const message = composeMagicLinkMessage({
    firstName,
    language: cleaner.languagePreferred,
    url,
  });

  try {
    // immediate: destinatario e' la cleaner, non un ospite.
    const res = await sendText(cleaner.whatsappNumber, message, { immediate: true });
    return { status: 'sent', messageId: res.messageId, url };
  } catch (err) {
    return {
      status: 'send_error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function composeMagicLinkMessage(input: {
  firstName: string;
  language: string;
  url: string;
}): string {
  if (input.language === 'en') {
    return [
      `Hi ${input.firstName} 👋`,
      '',
      'Premura is the new app to coordinate kit set-ups.',
      'Open it from your phone:',
      input.url,
      '',
      'Save it on your home screen (Add to Home Screen) so you can find it quickly.',
      '',
      'See you in the app.',
    ].join('\n');
  }
  // Italiano default + 'es' fallback (Karen e' italiana V1).
  return [
    `Ciao ${input.firstName} 👋`,
    '',
    'Premura è la nuova app per coordinare i kit di benvenuto.',
    'Aprila dal telefono:',
    input.url,
    '',
    'Salvala sulla schermata Home (Aggiungi a Home) così la trovi al volo.',
    '',
    "Ci vediamo nell'app.",
  ].join('\n');
}
