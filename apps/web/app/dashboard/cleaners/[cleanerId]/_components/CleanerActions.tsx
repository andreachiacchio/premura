'use client';

import { useState, useTransition } from 'react';
import {
  deactivateCleanerAction,
  reactivateCleanerAction,
  sendCleanerWelcomeWaAction,
} from '../../actions';

export function CleanerActions({
  cleanerId,
  isActive,
  karenAccepted,
}: {
  cleanerId: string;
  isActive: boolean;
  karenAccepted: boolean;
}): React.JSX.Element {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [welcomeSent, setWelcomeSent] = useState(false);

  function handleDeactivate(): void {
    setError(null);
    startTransition(async () => {
      const r = await deactivateCleanerAction(cleanerId);
      if (!r.ok) setError(`Errore: ${r.reason}`);
      setConfirmDeactivate(false);
    });
  }

  function handleReactivate(): void {
    setError(null);
    startTransition(async () => {
      const r = await reactivateCleanerAction(cleanerId);
      if (!r.ok) setError(`Errore: ${r.reason}`);
    });
  }

  function handleSendWelcome(): void {
    setError(null);
    startTransition(async () => {
      const r = await sendCleanerWelcomeWaAction(cleanerId);
      if (!r.ok) {
        setError(`Errore invio: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
        return;
      }
      setWelcomeSent(true);
    });
  }

  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <h2 className="mb-3 text-sm font-medium text-ink-mute">Azioni</h2>
      {error && (
        <div className="mb-3 rounded-md border border-terracotta-2/40 bg-peach px-3 py-2 text-sm text-terracotta-2">
          {error}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {isActive && (
          <button
            type="button"
            onClick={handleSendWelcome}
            disabled={pending}
            className="rounded-md bg-terracotta px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-terracotta-2 disabled:opacity-60"
          >
            {welcomeSent
              ? '✓ Magic link inviato'
              : karenAccepted
                ? '🔁 Invia nuovo magic link'
                : '📱 Manda magic link cleaner app'}
          </button>
        )}
        {isActive ? (
          confirmDeactivate ? (
            <>
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={pending}
                className="rounded-md bg-terracotta-2 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
              >
                Conferma disattivazione
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeactivate(false)}
                className="rounded-md border border-line bg-white px-4 py-2 text-sm text-ink-mute hover:text-ink"
              >
                Annulla
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeactivate(true)}
              className="rounded-md border border-terracotta-2/40 bg-peach px-4 py-2 text-sm font-medium text-terracotta-2 hover:bg-peach"
            >
              Disattiva cleaner
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={handleReactivate}
            disabled={pending}
            className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:border-terracotta disabled:opacity-60"
          >
            Riattiva cleaner
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-mute">
        Disattivare un cleaner non lo cancella: rimane nello storico e i kit passati. Le property
        assegnate restano ma non riceveranno nuovi brief finché non assegni un cleaner attivo.
      </p>
    </section>
  );
}
