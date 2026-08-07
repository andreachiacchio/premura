import { BackLink } from '@/components/BackLink';
import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { startTimer, timed } from '@/lib/perf';
import { propertyColorOrFallback } from '@/lib/property-color';
import { EmptyState } from '../_components/EmptyState';
import {
  type ConversationListItem,
  listConversationsForHost,
} from '@/lib/repositories/conversations';
import Link from 'next/link';

// Sezione Conversazioni (Fase 4 weekend, 30/07). Mobile-first: e' la
// pagina che Andrea apre dal telefono quando arriva un messaggio.
//
// Regole di copy: stato in linguaggio umano, mai contatori tecnici.
// Una conversazione non attribuita si vede e si dice ("numero
// sconosciuto"), non si nasconde.

export const dynamic = 'force-dynamic';

function timePhrase(d: Date | null, now: Date): string {
  if (!d) return '';
  const mins = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return 'adesso';
  if (mins < 60) return `${mins} min fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? "un'ora fa" : `${hours} ore fa`;
  return d.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Rome',
  });
}

function conversationTitle(c: ConversationListItem): string {
  if (c.attributed) {
    return c.guestFirstName ?? c.guestFullName ?? 'Ospite';
  }
  return c.externalThreadId ? `+${c.externalThreadId.replace(/^\+/, '')}` : 'Numero sconosciuto';
}

export default async function ConversationsPage(): Promise<React.JSX.Element> {
  const stop = startTimer('PAGINA /dashboard/conversations dati');
  const hostId = await timed('getCurrentHostId', () => getCurrentHostId());
  const { db } = await getDb();
  const conversations = await timed('q listConversationsForHost', () =>
    listConversationsForHost(db, hostId),
  );
  stop();
  const now = new Date();

  const pendingTotal = conversations.reduce((acc, c) => acc + c.pendingDraftCount, 0);

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-ivory px-5 pt-12 pb-16">
      <header className="mb-8">
        <BackLink href="/dashboard">Oggi</BackLink>
        <h1 className="mt-2 font-serif text-h1 leading-[1.05] tracking-tight text-ink">
          Conversazioni
        </h1>
        <p className="mt-3 text-body-lg text-ink-soft">
          Tutto quello che entra ed esce da WhatsApp, con le risposte proposte da Premura in
          attesa del tuo ok. Nessun messaggio invisibile.
        </p>
        {pendingTotal > 0 ? (
          <p className="mt-2 inline-flex rounded-full bg-gold-soft px-3 py-1 text-body-sm font-medium text-gold-deep">
            {pendingTotal === 1 ? 'Una bozza aspetta il tuo ok' : `${pendingTotal} bozze aspettano il tuo ok`}
          </p>
        ) : null}
      </header>

      {conversations.length === 0 ? (
        <EmptyState hint="Quando un ospite scrive su WhatsApp la conversazione compare qui, con la risposta pronta da approvare.">
          Nessun messaggio aperto. Ti scrivo solo se serve.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {conversations.map((c) => {
            const color = c.propertyName
              ? propertyColorOrFallback(c.propertyColor, c.propertyName)
              : null;
            return (
              <li key={c.id}>
                <Link
                  href={`/dashboard/conversations/${c.id}`}
                  className="block rounded-card border border-line bg-paper px-5 py-4 shadow-sm transition hover:border-terracotta-soft"
                  style={color ? { borderLeftWidth: 3, borderLeftColor: color } : undefined}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-serif text-h4 leading-tight text-ink">
                      {conversationTitle(c)}
                    </span>
                    <span className="shrink-0 text-body-sm text-ink-mute">
                      {timePhrase(c.lastMessageAt, now)}
                    </span>
                  </div>
                  {c.attributed && c.propertyName ? (
                    <div
                      className="mt-0.5 text-eyebrow uppercase tracking-wider"
                      style={color ? { color } : undefined}
                    >
                      {c.propertyName}
                    </div>
                  ) : (
                    <div className="mt-0.5 text-eyebrow uppercase tracking-wider text-gold-deep">
                      Non attribuita · nessuna prenotazione collegata
                    </div>
                  )}
                  {c.lastMessagePreview ? (
                    <p className="mt-2 line-clamp-2 text-body-sm text-ink-soft">
                      {c.lastMessageDirection === 'outbound' ? 'Tu: ' : ''}
                      {c.lastMessagePreview}
                    </p>
                  ) : null}
                  {c.pendingDraftCount > 0 ? (
                    <p className="mt-2 inline-flex rounded-full bg-gold-soft px-2.5 py-0.5 text-[12px] font-medium text-gold-deep">
                      {c.pendingDraftCount === 1
                        ? 'Risposta proposta — da approvare'
                        : `${c.pendingDraftCount} risposte proposte — da approvare`}
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
