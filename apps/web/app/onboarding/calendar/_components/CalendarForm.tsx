'use client';

import { SubmitButton } from '@/components/forms/SubmitButton';
import { useState, useTransition } from 'react';
import { submitCalendarAction, testIcalUrlAction } from '../../actions';

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; events: number }
  | { kind: 'error'; message: string };

export function CalendarForm(): React.JSX.Element {
  const [url, setUrl] = useState('');
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();

  function handleTest(): void {
    if (!url.trim()) {
      setTestState({ kind: 'error', message: 'Inserisci un URL prima.' });
      return;
    }
    setTestState({ kind: 'testing' });
    startTransition(async () => {
      const r = await testIcalUrlAction(url);
      if (r.ok) {
        setTestState({ kind: 'ok', events: r.eventsFound });
      } else {
        setTestState({ kind: 'error', message: r.detail ?? r.reason });
      }
    });
  }

  return (
    <form action={submitCalendarAction} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="text-body-sm font-medium text-ink-soft">URL iCal Booking / Airbnb</span>
        <input
          type="url"
          name="icalBookingUrl"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://ical.booking.com/v1/export?t=…"
          className="h-12 rounded-card border border-line bg-paper px-4 text-body-sm text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none focus:ring-2 focus:ring-terracotta-soft/40"
        />
        <span className="text-body-sm text-ink-mute">
          Lo trovi su <em>admin.booking.com</em> → Calendari → Esporta calendario.
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={pending}
          className="rounded-card border border-line bg-paper px-4 py-2 text-body-sm text-ink hover:border-terracotta disabled:opacity-60"
        >
          {testState.kind === 'testing' ? 'Test in corso…' : 'Testa connessione'}
        </button>
        {testState.kind === 'ok' && (
          <span className="text-body-sm text-ok">✓ Trovati {testState.events} eventi</span>
        )}
        {testState.kind === 'error' && (
          <span className="text-body-sm text-terracotta-2">{testState.message}</span>
        )}
      </div>

      <SubmitButton variant="accent" size="lg" pendingLabel="Procedo…" className="mt-2 w-full">
        Continua
      </SubmitButton>
    </form>
  );
}
