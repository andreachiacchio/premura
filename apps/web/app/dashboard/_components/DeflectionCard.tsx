'use client';

// DeflectionCard (slice 7a.3): card mostrata accanto a una prenotazione
// Booking/Airbnb nuova per cui non e' ancora stato fatto il nudge WA.
//
// Flusso UI:
//   1. Render: se `draft` non esiste, mostra bottone "Genera saluto WA"
//      che invoca generateDeflectionDraftAction.
//   2. Render con draft esistente: mostra preview body + 2 bottoni:
//      - "Copia testo" -> clipboard API + markDeflectionSentAction
//      - "Apri Booking inbox" / "Apri Airbnb inbox" -> deep link
//        all'extranet (fallback URL generico)
//   3. Render con draft approved: mostra "Saluto WA inviato" + timestamp.
//
// Tutto mobile-first, palette Premura (peach/terracotta/blu), Inter +
// Fraunces.

import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState, useTransition } from 'react';
import { generateDeflectionDraftAction, markDeflectionSentAction } from '../actions';

export type DeflectionDraftSummary = {
  id: string;
  draftResponse: string;
  status: 'pending' | 'approved' | 'rejected' | 'modified' | 'expired';
  approvedAt: Date | null;
  metadata: {
    target_channel?: 'booking_inbox' | 'airbnb_inbox';
    wa_number?: string;
    deflection_attempt?: boolean;
  };
};

type Props = {
  bookingId: string;
  platform: 'booking' | 'airbnb';
  guestFirstName: string;
  draft: DeflectionDraftSummary | null;
};

const EXTRANET_LINKS: Record<'booking' | 'airbnb', { label: string; href: string }> = {
  booking: {
    label: 'Apri Booking inbox',
    href: 'https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/booking_messages.html',
  },
  airbnb: {
    label: 'Apri Airbnb inbox',
    href: 'https://www.airbnb.com/hosting/messages',
  },
};

export function DeflectionCard({ bookingId, platform, guestFirstName, draft }: Props) {
  const [pending, startTransition] = useTransition();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleGenerate = (): void => {
    startTransition(async () => {
      try {
        await generateDeflectionDraftAction(bookingId);
      } catch (err) {
        console.error('[DeflectionCard] generate failed', err);
      }
    });
  };

  const handleCopy = async (): Promise<void> => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.draftResponse);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2500);
      // Fire-and-forget tracking. Errori catturati dal catch nell'action.
      startTransition(async () => {
        try {
          await markDeflectionSentAction(draft.id);
        } catch (err) {
          console.error('[DeflectionCard] markSent failed', err);
        }
      });
    } catch (err) {
      console.error('[DeflectionCard] clipboard failed', err);
      setCopyState('error');
    }
  };

  // Caso 1: draft non ancora generato.
  if (!draft) {
    return (
      <div className="rounded-card border border-terracotta-soft bg-ivory px-4 py-3.5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="font-fraunces text-[15px] font-semibold text-blu-deep">
              Sposta {guestFirstName} su WhatsApp
            </div>
            <p className="mt-1 text-body-sm text-blu-deep/70">
              Premura prepara un saluto pronto da copiare nella inbox{' '}
              {platform === 'booking' ? 'Booking' : 'Airbnb'}.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={pending}
            className="shrink-0 rounded-button bg-terracotta px-3.5 py-2 text-[13px] font-semibold text-ivory transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Genero...' : 'Genera saluto'}
          </button>
        </div>
      </div>
    );
  }

  // Caso 2: draft gia' approved (host ha cliccato Copia).
  if (draft.status === 'approved') {
    return (
      <div className="rounded-card border border-blu-deep/10 bg-ivory px-4 py-3.5 shadow-sm opacity-80">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-blu-deep">
          <Check aria-hidden className="size-4 text-emerald-700" />
          Saluto copiato{' '}
          {draft.approvedAt
            ? `il ${new Date(draft.approvedAt).toLocaleDateString('it-IT', {
                day: 'numeric',
                month: 'short',
              })}`
            : ''}
        </div>
        <p className="mt-1 text-body-sm text-blu-deep/60">
          Aspettiamo che {guestFirstName} risponda su WhatsApp.
        </p>
      </div>
    );
  }

  // Caso 3: draft pending. Mostra preview + bottoni.
  const link = EXTRANET_LINKS[platform];
  return (
    <div className="rounded-card border border-terracotta-soft bg-gradient-to-br from-peach to-peach-deep px-4 py-3.5 shadow-sm">
      <div className="font-fraunces text-[15px] font-semibold text-blu-deep">
        Manda saluto WA a {guestFirstName}
      </div>
      <pre className="mt-2 whitespace-pre-wrap rounded-card-sm bg-ivory/80 px-3 py-2.5 font-inter text-[13px] leading-relaxed text-blu-deep">
        {draft.draftResponse}
      </pre>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-button bg-terracotta px-3.5 py-2 text-[13px] font-semibold text-ivory transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {copyState === 'copied' ? (
            <>
              <Check aria-hidden className="size-4" />
              Copiato!
            </>
          ) : (
            <>
              <Copy aria-hidden className="size-4" />
              Copia testo
            </>
          )}
        </button>
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-button border border-blu-deep/20 bg-ivory px-3.5 py-2 text-[13px] font-semibold text-blu-deep transition-opacity hover:opacity-80"
        >
          {link.label}
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      </div>
      {copyState === 'error' ? (
        <div className="mt-2 text-body-sm text-terracotta-2">
          Impossibile copiare in automatico. Seleziona il testo manualmente.
        </div>
      ) : null}
    </div>
  );
}
