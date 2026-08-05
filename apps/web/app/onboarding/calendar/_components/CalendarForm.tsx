'use client';

import { useState, useTransition } from 'react';
import { submitCalendarAction, testIcalUrlAction } from '../../actions';

// Onboarding schermata 2 (05/08, ordine Andrea): i due feed NON sono
// equivalenti e la schermata deve dirlo PRIMA, non dopo.
//   - Airbnb per primo: porta il nome dell'ospite.
//   - Booking: porta le date, mai nome ne' telefono (esporta fasce
//     anonime "CLOSED - Not available", prenotazioni vere incluse).
// Se l'host collega solo Booking glielo diciamo subito, con quello che
// vedra' e quello che manca: non e' un limite da nascondere, e' il
// motivo per cui serve il passo dopo (chiedere il numero all'ospite).

type FeedKey = 'airbnb' | 'booking';

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; events: number }
  | { kind: 'error'; message: string };

const FEEDS: Array<{
  key: FeedKey;
  field: string;
  title: string;
  porta: string;
  placeholder: string;
  dove: React.ReactNode;
}> = [
  {
    key: 'airbnb',
    field: 'icalAirbnbUrl',
    title: 'Airbnb',
    porta: 'Porta il nome dell’ospite, oltre alle date.',
    placeholder: 'https://www.airbnb.it/calendar/ical/…',
    dove: (
      <>
        Airbnb → <em>Annunci</em> → la tua casa → <em>Disponibilità</em> →{' '}
        <em>Sincronizza calendari</em> → <em>Esporta calendario</em>.
      </>
    ),
  },
  {
    key: 'booking',
    field: 'icalBookingUrl',
    title: 'Booking.com',
    porta:
      'Porta le date. Nome e telefono non ci sono: li aggiungi tu, oppure li chiede Premura all’ospite.',
    placeholder: 'https://ical.booking.com/v1/export?t=…',
    dove: (
      <>
        Extranet Booking → <em>Tariffe e disponibilità</em> → <em>Sincronizza calendari</em> →{' '}
        <em>Esporta calendario</em>.
      </>
    ),
  },
];

export function CalendarForm(): React.JSX.Element {
  const [urls, setUrls] = useState<Record<FeedKey, string>>({ airbnb: '', booking: '' });
  const [tests, setTests] = useState<Record<FeedKey, TestState>>({
    airbnb: { kind: 'idle' },
    booking: { kind: 'idle' },
  });
  const [pending, startTransition] = useTransition();

  const soloBooking = urls.booking.trim() !== '' && urls.airbnb.trim() === '';

  function handleTest(key: FeedKey): void {
    const url = urls[key];
    if (!url.trim()) {
      setTests((s) => ({ ...s, [key]: { kind: 'error', message: 'Inserisci un URL prima.' } }));
      return;
    }
    setTests((s) => ({ ...s, [key]: { kind: 'testing' } }));
    startTransition(async () => {
      const r = await testIcalUrlAction(url);
      setTests((s) => ({
        ...s,
        [key]: r.ok
          ? { kind: 'ok', events: r.eventsFound }
          : {
              kind: 'error',
              message:
                r.reason === 'invalid_url'
                  ? 'Questo non sembra un indirizzo: copia il link di esportazione, non la pagina.'
                  : r.reason === 'fetch_failed'
                    ? 'Questo link non risponde: controlla di aver copiato quello di esportazione.'
                    : 'Il link risponde ma non è un calendario: hai copiato quello giusto?',
            },
      }));
    });
  }

  return (
    <form action={submitCalendarAction} className="flex flex-col gap-6">
      {FEEDS.map((feed) => {
        const test = tests[feed.key];
        return (
          <div key={feed.key} className="rounded-card border border-line bg-paper p-4 md:p-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-serif text-h4 text-ink">{feed.title}</h3>
              <p className="text-body-sm text-ink-soft">{feed.porta}</p>
            </div>

            <input
              type="url"
              name={feed.field}
              value={urls[feed.key]}
              onChange={(e) => {
                const v = e.target.value;
                setUrls((s) => ({ ...s, [feed.key]: v }));
                setTests((s) => ({ ...s, [feed.key]: { kind: 'idle' } }));
              }}
              placeholder={feed.placeholder}
              className="mt-4 h-12 w-full rounded-card border border-line bg-ivory px-4 text-body-sm text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none focus:ring-2 focus:ring-terracotta-soft/40"
            />

            <p className="mt-2 text-body-sm text-ink-mute">{feed.dove}</p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => handleTest(feed.key)}
                disabled={pending}
                className="rounded-card border border-line bg-paper px-4 py-2 text-body-sm text-ink hover:border-terracotta disabled:opacity-60"
              >
                {test.kind === 'testing' ? 'Verifica in corso…' : 'Verifica il link'}
              </button>
              {test.kind === 'ok' && (
                <span className="text-body-sm text-ok-deep">
                  ✓ Funziona — {test.events} {test.events === 1 ? 'data trovata' : 'date trovate'}
                </span>
              )}
              {test.kind === 'error' && (
                <span className="text-body-sm text-terracotta-2">{test.message}</span>
              )}
            </div>
          </div>
        );
      })}

      {soloBooking && (
        <div className="rounded-card border border-gold-soft bg-gold-soft/30 p-4">
          <p className="text-body-sm text-ink">
            <strong>Con il solo Booking vedrai date occupate, non ospiti.</strong> Le prenotazioni
            compariranno come «Un ospite», senza nome né telefono: è Booking a non esportarli.
            Premura lo chiede all’ospite, oppure lo aggiungi tu in un tocco dalla home. Se hai anche
            Airbnb, collegalo qui sopra: da lì i nomi arrivano.
          </p>
        </div>
      )}

      <button
        type="submit"
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-terracotta px-6 text-body font-medium text-paper shadow-md transition-colors hover:bg-terracotta-2 active:translate-y-px"
      >
        Continua
      </button>
    </form>
  );
}
