'use client';

// Pannello bozza dentro il thread (Fase 4 weekend, 30/07).
// La risposta proposta da Premura, dove starebbe nel thread. Tre
// azioni: Approva, Modifica, Scarta. Approva NON invia: accoda — e lo
// diciamo qui, non in un tooltip.

import { Check, Edit3, Trash2, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import {
  approveReplyDraftAction,
  editAndQueueReplyDraftAction,
  rejectReplyDraftAction,
} from '../../actions';

export type ThreadDraftPanelData = {
  id: string;
  draftBody: string;
  reasoning: string | null;
  confidence?: number;
  classification?: string;
};

const REASON_MESSAGES: Record<string, string> = {
  not_found: "Bozza non trovata. Forse e' gia' stata gestita.",
  no_guest_phone: 'Numero ospite mancante: aggiungilo dalla scheda prenotazione.',
  channel_not_supported: 'Canale non ancora supportato: solo WhatsApp.',
  already_processed: "Bozza gia' gestita (forse da un altro dispositivo).",
};

export function ThreadDraftPanel({ draft }: { draft: ThreadDraftPanelData }) {
  const [pending, startTransition] = useTransition();
  const [editMode, setEditMode] = useState(false);
  const [editedBody, setEditedBody] = useState(draft.draftBody);
  const [error, setError] = useState<string | null>(null);

  const approve = (): void => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await approveReplyDraftAction(draft.id);
        if (!result.ok) setError(REASON_MESSAGES[result.reason] ?? 'Errore inatteso.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Approvazione fallita');
      }
    });
  };

  const approveEdited = (): void => {
    setError(null);
    if (editedBody.trim().length < 2) {
      setError('Il messaggio è troppo corto.');
      return;
    }
    startTransition(async () => {
      try {
        const result = await editAndQueueReplyDraftAction(draft.id, editedBody);
        if (!result.ok) setError(REASON_MESSAGES[result.reason] ?? 'Errore inatteso.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Approvazione fallita');
      }
    });
  };

  const discard = (): void => {
    setError(null);
    if (!window.confirm('Scartare la risposta proposta?')) return;
    startTransition(async () => {
      try {
        await rejectReplyDraftAction(draft.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Scarto fallito');
      }
    });
  };

  return (
    <article className="rounded-card border border-gold-soft bg-paper px-4 py-3.5 shadow-sm">
      <p className="text-eyebrow uppercase tracking-wider text-gold-deep">
        Risposta proposta da Premura — aspetta il tuo ok
      </p>

      {editMode ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={editedBody}
            onChange={(e) => setEditedBody(e.target.value)}
            rows={6}
            maxLength={2000}
            className="w-full rounded-card border border-line bg-paper px-3 py-2 font-inter text-body text-ink focus:border-terracotta-soft focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={approveEdited}
              disabled={pending}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-terracotta px-4 text-body-sm font-medium text-paper shadow-sm hover:bg-terracotta-2 disabled:opacity-50"
            >
              <Check aria-hidden className="size-4" />
              Approva modifiche
            </button>
            <button
              type="button"
              onClick={() => {
                setEditMode(false);
                setEditedBody(draft.draftBody);
                setError(null);
              }}
              disabled={pending}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-transparent px-4 text-body-sm font-medium text-ink hover:bg-line-soft disabled:opacity-50"
            >
              <X aria-hidden className="size-4" />
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-2.5">
          <pre className="whitespace-pre-wrap rounded-card-sm bg-ivory px-3 py-2.5 font-inter text-body leading-relaxed text-ink">
            {draft.draftBody}
          </pre>
          {draft.reasoning ? (
            <details className="text-body-sm text-ink-mute">
              <summary className="cursor-pointer">Perché questa risposta</summary>
              <p className="mt-1 text-ink-soft">{draft.reasoning}</p>
            </details>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={approve}
              disabled={pending}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-terracotta px-4 text-body-sm font-medium text-paper shadow-sm hover:bg-terracotta-2 disabled:opacity-50"
            >
              <Check aria-hidden className="size-4" />
              Approva
            </button>
            <button
              type="button"
              onClick={() => setEditMode(true)}
              disabled={pending}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-transparent px-4 text-body-sm font-medium text-ink hover:bg-line-soft disabled:opacity-50"
            >
              <Edit3 aria-hidden className="size-4" />
              Modifica
            </button>
            <button
              type="button"
              onClick={discard}
              disabled={pending}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-transparent px-4 text-body-sm font-medium text-ink-soft hover:text-ink-mute disabled:opacity-50"
            >
              <Trash2 aria-hidden className="size-4" />
              Scarta
            </button>
          </div>
          <p className="text-body-sm text-ink-mute">
            Approva mette il messaggio in coda, non lo invia subito. Con gli invii automatici in
            pausa (rodaggio) resta in coda finché non li riattivi: comparirà qui sopra come «in
            coda».
          </p>
        </div>
      )}

      {error ? <p className="mt-2 text-body-sm text-alert">{error}</p> : null}
    </article>
  );
}
