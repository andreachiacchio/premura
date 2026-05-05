'use client';

// Slice 11 — ReplyDraftCard.
// Card dashboard per un pending reply_draft. Mostra ospite + ultimo
// messaggio inbound + draft proposto + confidence + classification.
// 3 azioni: Invia, Modifica (textarea + Invia), Scarta.

import { Check, Edit3, Send, Trash2, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import {
  approveReplyDraftAction,
  editAndSendReplyDraftAction,
  rejectReplyDraftAction,
} from '../actions';

export type ReplyDraftCardData = {
  id: string;
  draftBody: string;
  reasoning: string | null;
  metadata: {
    confidence?: number;
    classification?: string;
    suggested_action?: string;
    routing?: string;
  };
  inboundMessageBody: string | null;
  guestFullName: string;
  guestFirstName: string | null;
  guestLanguage: string | null;
  channel: 'whatsapp' | 'booking_inbox' | 'airbnb_inbox' | 'email' | null;
  propertyName: string;
};

export function ReplyDraftCard({ draft }: { draft: ReplyDraftCardData }) {
  const [pending, startTransition] = useTransition();
  const [editMode, setEditMode] = useState(false);
  const [editedBody, setEditedBody] = useState(draft.draftBody);
  const [error, setError] = useState<string | null>(null);

  const guestName =
    draft.guestFirstName ?? draft.guestFullName.split(/\s+/)[0] ?? draft.guestFullName;
  const channelLabel =
    draft.channel === 'whatsapp'
      ? 'WhatsApp'
      : draft.channel === 'booking_inbox'
        ? 'Booking'
        : draft.channel === 'airbnb_inbox'
          ? 'Airbnb'
          : 'email';

  const handleSend = (): void => {
    setError(null);
    startTransition(async () => {
      try {
        await approveReplyDraftAction(draft.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invio fallito');
      }
    });
  };

  const handleEditSubmit = (): void => {
    setError(null);
    if (editedBody.trim().length < 2) {
      setError('Il messaggio è troppo corto.');
      return;
    }
    startTransition(async () => {
      try {
        await editAndSendReplyDraftAction(draft.id, editedBody);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invio fallito');
      }
    });
  };

  const handleReject = (): void => {
    setError(null);
    startTransition(async () => {
      try {
        await rejectReplyDraftAction(draft.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Scarto fallito');
      }
    });
  };

  return (
    <article className="rounded-card border border-line bg-paper px-5 py-4 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-body-sm">
            <span className="font-serif text-h4 leading-tight text-ink">{guestName}</span>
            <ConfidenceBadge confidence={draft.metadata.confidence} />
            <ClassificationBadge classification={draft.metadata.classification} />
          </div>
          <div className="mt-0.5 text-eyebrow uppercase tracking-wider text-ink-mute">
            {draft.propertyName} · {channelLabel}
          </div>
        </div>
      </header>

      {draft.inboundMessageBody ? (
        <blockquote className="mt-3 rounded-card-sm border-l-4 border-line bg-ivory px-3 py-2 text-body-sm text-ink-soft">
          {draft.inboundMessageBody.slice(0, 400)}
          {draft.inboundMessageBody.length > 400 ? '...' : ''}
        </blockquote>
      ) : null}

      {editMode ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={editedBody}
            onChange={(e) => setEditedBody(e.target.value)}
            rows={5}
            maxLength={2000}
            className="w-full rounded-card border border-line bg-paper px-3 py-2 font-inter text-body text-ink focus:border-terracotta-soft focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleEditSubmit}
              disabled={pending}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-terracotta px-4 text-body-sm font-medium text-paper shadow-sm hover:bg-terracotta-2 disabled:opacity-50"
            >
              <Send aria-hidden className="size-4" />
              Invia modifiche
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
        <div className="mt-3 flex flex-col gap-3">
          <pre className="whitespace-pre-wrap rounded-card-sm bg-ivory px-3 py-2.5 font-inter text-body leading-relaxed text-ink">
            {draft.draftBody}
          </pre>
          {draft.reasoning ? (
            <details className="text-body-sm text-ink-mute">
              <summary className="cursor-pointer">Perché questo draft</summary>
              <p className="mt-1 text-ink-soft">{draft.reasoning}</p>
            </details>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={pending}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-terracotta px-4 text-body-sm font-medium text-paper shadow-sm hover:bg-terracotta-2 disabled:opacity-50"
            >
              <Check aria-hidden className="size-4" />
              Invia
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
              onClick={handleReject}
              disabled={pending}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-transparent px-4 text-body-sm font-medium text-ink-soft hover:text-ink-mute disabled:opacity-50"
            >
              <Trash2 aria-hidden className="size-4" />
              Scarta
            </button>
          </div>
        </div>
      )}

      {error ? <p className="mt-2 text-body-sm text-alert">{error}</p> : null}
    </article>
  );
}

function ConfidenceBadge({ confidence }: { confidence?: number }) {
  if (confidence === undefined) return null;
  const level = confidence > 0.85 ? 'high' : confidence > 0.6 ? 'mid' : 'low';
  const cls =
    level === 'high'
      ? 'bg-line-soft text-ok border border-ok/20'
      : level === 'mid'
        ? 'bg-gold-soft text-gold-deep'
        : 'bg-peach text-terracotta-2 border border-terracotta-soft';
  const label =
    level === 'high'
      ? 'Confidence alta'
      : level === 'mid'
        ? 'Confidence media'
        : 'Confidence bassa';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

const CLASSIFICATION_LABELS: Record<string, { label: string; cls: string }> = {
  info_request: { label: 'Info pratica', cls: 'bg-line-soft text-ink-soft' },
  small_talk: { label: 'Conversazione', cls: 'bg-line-soft text-ink-soft' },
  complaint: {
    label: 'Lamentela',
    cls: 'bg-peach text-terracotta-2 border border-terracotta-soft',
  },
  emergency: {
    label: 'EMERGENZA',
    cls: 'bg-alert text-paper',
  },
  booking_question: { label: 'Domanda prenotazione', cls: 'bg-gold-soft text-gold-deep' },
  other: { label: 'Altro', cls: 'bg-line-soft text-ink-soft' },
};

function ClassificationBadge({ classification }: { classification?: string }) {
  if (!classification) return null;
  const meta = CLASSIFICATION_LABELS[classification] ??
    CLASSIFICATION_LABELS.other ?? { label: classification, cls: 'bg-line-soft text-ink-soft' };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}
