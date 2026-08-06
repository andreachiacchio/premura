'use client';

import { Check, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setBookingGuestPhoneAction } from '../upcoming-checkins/actions';
import { useResolveDecision } from './DecisionCard';

// Input inline per risolvere "ospite senza numero" DENTRO il blocco
// decisioni della home. Principio di prodotto: ogni problema porta con
// se' l'azione che lo risolve — niente "vai alla pagina check-in".
// Riusa la stessa server action della pagina check-in: normalizzazione
// E.164 e audit restano in un posto solo.

export function InlinePhoneFix({
  bookingId,
  guestName,
}: {
  bookingId: string;
  guestName: string;
}): React.JSX.Element {
  const router = useRouter();
  const resolve = useResolveDecision();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = (): void => {
    const trimmed = draft.trim();
    if (!trimmed || pending || saved) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await setBookingGuestPhoneAction(bookingId, trimmed);
        if (!result.ok) {
          setError(result.reason === 'invalid_phone' ? 'Numero non valido' : 'Salvataggio fallito');
          return;
        }
        setSaved(true);
        // L'attesa serve: il refresh rimonta l'albero e senza di essa la
        // card sparirebbe di colpo, senza dire che il numero e' salvo.
        await resolve(`Numero di ${guestName} salvato — me ne occupo io`);
        router.refresh();
      } catch {
        setError('Errore di rete');
      }
    });
  };

  if (saved) {
    return (
      <span className="inline-flex min-h-[44px] items-center gap-1 text-body font-medium text-ok">
        <Check aria-hidden className="size-4" />
        Fatto
      </span>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
      <input
        type="tel"
        inputMode="tel"
        placeholder="+39 333 1234567"
        value={draft}
        disabled={pending}
        aria-label={`Numero WhatsApp di ${guestName}`}
        aria-invalid={error ? true : undefined}
        className={`min-h-[44px] w-full rounded-card-sm border bg-paper px-3 text-body text-ink focus:outline-none focus:ring-2 focus:ring-terracotta-soft/40 sm:w-52 ${error ? 'border-alert' : 'border-line'}`}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
        }}
        onBlur={save}
      />
      {pending ? <Loader2 aria-hidden className="size-4 animate-spin text-ink-mute" /> : null}
      {error ? <span className="text-body text-alert">{error}</span> : null}
    </div>
  );
}
