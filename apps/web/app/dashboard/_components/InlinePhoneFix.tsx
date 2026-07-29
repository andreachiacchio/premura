'use client';

import { Check, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { setBookingGuestPhoneAction } from '../upcoming-checkins/actions';

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
        // La revalidate fara' sparire la voce dal blocco; il check da'
        // riscontro immediato nel frattempo.
        setSaved(true);
      } catch {
        setError('Errore di rete');
      }
    });
  };

  if (saved) {
    return (
      <span className="inline-flex items-center gap-1 text-body-sm font-medium text-ok">
        <Check aria-hidden className="size-4" />
        Fatto
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="tel"
        inputMode="tel"
        placeholder="+39 333 1234567"
        value={draft}
        disabled={pending}
        aria-label={`Numero WhatsApp di ${guestName}`}
        aria-invalid={error ? true : undefined}
        className={`h-9 w-44 rounded-card-sm border bg-paper px-2.5 text-body text-ink focus:outline-none focus:ring-2 focus:ring-terracotta-soft/40 ${error ? 'border-alert' : 'border-line'}`}
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
      {error ? <span className="text-body-sm text-alert">{error}</span> : null}
    </div>
  );
}
