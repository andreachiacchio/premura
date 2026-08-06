'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { confirmCancellationAction, dismissCancellationAction } from '../actions';
import { decisionActionClass, useResolveDecision } from './DecisionCard';

// Azioni della voce "possibile cancellazione": l'host conferma
// (cancellata davvero) o smentisce (ancora attiva). La conferma chiede
// conferma — cancella una prenotazione, e non si torna indietro da soli.
//
// Niente swipe: e' un'azione che riguarda un ospite, e uno swipe
// involontario non deve poter cancellare un soggiorno.

export function PossibleCancellationActions({
  bookingId,
  guestLabel,
}: {
  bookingId: string;
  guestLabel: string;
}): React.JSX.Element {
  const router = useRouter();
  const resolve = useResolveDecision();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (
    action: (id: string) => Promise<{ ok: boolean }>,
    doneMessage: string,
    confirmText?: string,
  ): void => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    startTransition(async () => {
      const result = await action(bookingId);
      if (!result.ok) {
        setError('Operazione fallita, riprova');
        return;
      }
      // L'attesa serve: il refresh rimonta l'albero e senza di essa la
      // card sparirebbe di colpo, senza conferma di cosa e' successo.
      await resolve(doneMessage);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() =>
          run(
            confirmCancellationAction,
            `Prenotazione di ${guestLabel} archiviata`,
            `Confermi che la prenotazione di ${guestLabel} è cancellata? Premura smetterà di seguirla.`,
          )
        }
        disabled={pending}
        className={`${decisionActionClass} border border-alert/40 text-alert hover:bg-alert/5`}
      >
        Confermo: cancellata
      </button>
      <button
        type="button"
        onClick={() => run(dismissCancellationAction, `${guestLabel} resta in programma`)}
        disabled={pending}
        className={`${decisionActionClass} border border-line text-ink-soft hover:bg-line-soft`}
      >
        È ancora attiva
      </button>
      {error ? <p className="text-body text-alert">{error}</p> : null}
    </>
  );
}
