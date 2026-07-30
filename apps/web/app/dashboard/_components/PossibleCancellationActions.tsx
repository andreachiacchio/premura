'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  confirmCancellationAction,
  dismissCancellationAction,
} from '../actions';

// Azioni della voce "possibile cancellazione" in Serve una tua
// decisione: l'host conferma (cancellata davvero) o smentisce (ancora
// attiva). La conferma chiede conferma: cancella una prenotazione.

export function PossibleCancellationActions({
  bookingId,
  guestLabel,
}: {
  bookingId: string;
  guestLabel: string;
}): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: (id: string) => Promise<{ ok: boolean }>, confirmText?: string): void => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    startTransition(async () => {
      const result = await action(bookingId);
      if (!result.ok) setError('Operazione fallita, riprova');
      else router.refresh();
    });
  };

  const handleConfirm = (): void =>
    run(
      confirmCancellationAction,
      `Confermi che la prenotazione di ${guestLabel} è cancellata? Premura smetterà di seguirla.`,
    );
  const handleDismiss = (): void => run(dismissCancellationAction);

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={handleConfirm}
        disabled={pending}
        className="rounded-full border border-alert/40 px-3 py-1.5 text-[12px] font-medium text-alert hover:bg-alert/5 disabled:opacity-60"
      >
        Confermo: cancellata
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        disabled={pending}
        className="rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft hover:bg-line-soft disabled:opacity-60"
      >
        È ancora attiva
      </button>
      {error ? <p className="text-body-sm text-alert">{error}</p> : null}
    </div>
  );
}
