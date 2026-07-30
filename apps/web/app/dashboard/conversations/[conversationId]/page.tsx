import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { propertyColorOrFallback } from '@/lib/property-color';
import { type ThreadMessage, getConversationThread } from '@/lib/repositories/conversations';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ThreadDraftPanel } from '../_components/ThreadDraftPanel';

// Thread di una conversazione (Fase 4 weekend, 30/07). Bolle come su
// WhatsApp, stato di ogni messaggio in linguaggio umano. Le bozze
// pendenti stanno IN FONDO al thread, dove starebbero come risposta,
// con Approva / Modifica / Scarta.

export const dynamic = 'force-dynamic';

function timeLabel(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleString('it-IT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  });
}

// Stato in linguaggio umano (principio 29/07: mai codici).
function outboundStatusPhrase(m: ThreadMessage): string | null {
  if (m.direction !== 'outbound') return null;
  switch (m.status) {
    case 'queued':
      return 'In coda — parte quando gli invii automatici sono attivi';
    case 'sent':
      return 'Inviato';
    case 'failed':
      return 'Non inviato: qualcosa è andato storto, Premura riprova';
    case 'blocked':
      return 'Bloccato: il testo conteneva un contatto da non condividere';
    default:
      return null;
  }
}

export default async function ConversationThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}): Promise<React.JSX.Element> {
  const { conversationId } = await params;
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const thread = await getConversationThread(db, hostId, conversationId);
  if (!thread) notFound();

  const { conversation, messages, drafts } = thread;
  const color = conversation.propertyName
    ? propertyColorOrFallback(conversation.propertyColor, conversation.propertyName)
    : null;
  const title = conversation.attributed
    ? (conversation.guestFirstName ?? conversation.guestFullName ?? 'Ospite')
    : conversation.externalThreadId
      ? `+${conversation.externalThreadId.replace(/^\+/, '')}`
      : 'Numero sconosciuto';

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-ivory px-5 pt-12 pb-16">
      <header className="mb-6">
        <Link
          href="/dashboard/conversations"
          className="text-eyebrow uppercase text-ink-mute hover:text-ink-soft"
        >
          ← Conversazioni
        </Link>
        <h1 className="mt-2 font-serif text-h2 leading-[1.05] tracking-tight text-ink">{title}</h1>
        {conversation.attributed && conversation.propertyName ? (
          <p
            className="mt-1 text-eyebrow uppercase tracking-wider"
            style={color ? { color } : undefined}
          >
            {conversation.propertyName}
          </p>
        ) : (
          <p className="mt-1 text-body-sm text-gold-deep">
            Non attribuita: nessuna prenotazione collegata a questo numero. Premura non propone
            risposte finché non sa di chi si tratta.
          </p>
        )}
      </header>

      {messages.length === 0 ? (
        <p className="rounded-card border border-line-soft bg-paper px-5 py-6 text-body text-ink-soft">
          Nessun messaggio in questo thread.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {messages.map((m) => {
            const statusPhrase = outboundStatusPhrase(m);
            const isOut = m.direction === 'outbound';
            return (
              <li key={m.id} className={isOut ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    isOut
                      ? 'max-w-[85%] rounded-card rounded-br-sm bg-peach px-4 py-2.5'
                      : 'max-w-[85%] rounded-card rounded-bl-sm border border-line bg-paper px-4 py-2.5'
                  }
                >
                  <p className="whitespace-pre-wrap text-body leading-relaxed text-ink">{m.body}</p>
                  <p className="mt-1 text-[11px] text-ink-mute">
                    {timeLabel(m.sentAt ?? m.createdAt)}
                    {statusPhrase ? ` · ${statusPhrase}` : ''}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {drafts.length > 0 ? (
        <section className="mt-6 flex flex-col gap-3">
          {drafts.map((d) => (
            <ThreadDraftPanel
              key={d.id}
              draft={{
                id: d.id,
                draftBody: d.draftBody,
                reasoning: d.reasoning,
                confidence: d.metadata.confidence,
                classification: d.metadata.classification,
              }}
            />
          ))}
        </section>
      ) : null}
    </main>
  );
}
