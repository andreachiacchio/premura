'use client';

import { useState, useTransition } from 'react';
import { buildGuestInviteAction } from '../actions';
import { decisionActionClass } from './DecisionCard';

// La frase da incollare nell'inbox Booking o Airbnb quando il numero
// non c'è. Usa lo stesso testo già pronto (composeGuestInvite): la card
// della home non ne inventa un altro. Copiare non chiude la card: si
// chiude quando il numero arriva.

export function CopyInboxPhrase({ bookingId }: { bookingId: string }): React.JSX.Element {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = (): void => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await buildGuestInviteAction(bookingId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage(result.message);
        try {
          await navigator.clipboard.writeText(result.message);
          setCopied(true);
        } catch {
          setCopied(false);
          setError('Non riesco a copiare. Seleziona il testo qui sotto.');
        }
      } catch {
        setError('Non riesco a preparare la frase. Riprova.');
      }
    });
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <button
        type="button"
        onClick={copy}
        disabled={pending}
        className={`${decisionActionClass} border border-terracotta-soft text-terracotta-2 hover:bg-peach`}
      >
        {pending ? 'Preparo la frase…' : copied ? 'Copiata. Incolla nell’inbox.' : 'Copia frase'}
      </button>
      {message ? (
        <p className="whitespace-pre-wrap rounded-card border border-line bg-paper px-3 py-2 text-body text-ink">
          {message}
        </p>
      ) : null}
      {error ? <p className="text-body text-alert">{error}</p> : null}
    </div>
  );
}
