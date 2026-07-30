'use client';

import type { IcalProbeResult } from '@/lib/ical-probe';
import type { IcalSource } from '@premura/db';
import { useState, useTransition } from 'react';
import { addFeedAction, removeFeedAction, verifyFeedAction } from '../actions';

// Gestione feed di una struttura: verifica, aggiunta, rimozione.
// "Verifica feed" mostra un fatto (risponde, N eventi), non una promessa.

const SOURCE_LABELS: Record<IcalSource['source'], string> = {
  booking: 'Booking',
  airbnb: 'Airbnb',
  channel_manager: 'Channel manager',
};

const INPUT_CLS =
  'h-12 rounded-card border border-line bg-paper px-4 text-body text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none focus:ring-2 focus:ring-terracotta-soft/40';

function probeLabel(result: IcalProbeResult): string {
  if (result.ok) {
    if (result.eventsFound === 0) return 'Feed valido, 0 eventi (calendario vuoto o token nuovo)';
    return `Feed valido: ${result.eventsFound} ${result.eventsFound === 1 ? 'evento' : 'eventi'}`;
  }
  const reasons: Record<string, string> = {
    invalid_url: 'URL non valido',
    fetch_failed: 'Il feed non risponde',
    parse_failed: 'La risposta non è un calendario iCal',
  };
  return `${reasons[result.reason] ?? 'Errore'}${result.detail ? ` — ${result.detail}` : ''}`;
}

function FeedRow(props: { propertyId: string; feed: IcalSource }) {
  const [probe, setProbe] = useState<IcalProbeResult | null>(null);
  const [verifying, startVerify] = useTransition();
  const [removing, startRemove] = useTransition();

  return (
    <li className="rounded-card border border-line bg-paper p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body font-medium text-ink">
          {SOURCE_LABELS[props.feed.source]}
          {props.feed.channelManagerName ? ` (${props.feed.channelManagerName})` : ''}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={verifying}
            onClick={() =>
              startVerify(async () => setProbe(await verifyFeedAction(props.feed.url)))
            }
            className="text-body-sm font-medium text-terracotta-2 underline-offset-2 hover:underline disabled:opacity-60"
          >
            {verifying ? 'Verifico…' : 'Verifica feed'}
          </button>
          <button
            type="button"
            disabled={removing}
            onClick={() => {
              if (
                !window.confirm(
                  'Scollegare questo calendario? Le prenotazioni già importate restano.',
                )
              )
                return;
              startRemove(async () => {
                await removeFeedAction(props.propertyId, props.feed.url);
              });
            }}
            className="text-body-sm text-ink-mute underline-offset-2 hover:underline disabled:opacity-60"
          >
            {removing ? 'Rimuovo…' : 'Rimuovi'}
          </button>
        </div>
      </div>
      <p className="mt-1 break-all text-[12px] text-ink-mute">{props.feed.url}</p>
      {probe ? (
        <p className={`mt-2 text-body-sm ${probe.ok ? 'text-ink-soft' : 'text-terracotta-2'}`}>
          {probeLabel(probe)}
        </p>
      ) : null}
    </li>
  );
}

export function CalendarManager(props: { propertyId: string; feeds: IcalSource[] }) {
  const [url, setUrl] = useState('');
  const [source, setSource] = useState<IcalSource['source']>('booking');
  const [cmName, setCmName] = useState('');
  const [probe, setProbe] = useState<IcalProbeResult | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [verifying, startVerify] = useTransition();
  const [adding, startAdd] = useTransition();

  function handleAdd() {
    setAddError(null);
    const formData = new FormData();
    formData.set('url', url);
    formData.set('source', source);
    if (cmName) formData.set('channelManagerName', cmName);
    startAdd(async () => {
      const result = await addFeedAction(props.propertyId, formData);
      if (result.ok) {
        setUrl('');
        setCmName('');
        setProbe(null);
      } else {
        setAddError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {props.feeds.length === 0 ? (
        <p className="text-body-sm text-terracotta-2">
          Nessun calendario collegato — le prenotazioni non arrivano da sole.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {props.feeds.map((feed) => (
            <FeedRow key={feed.url} propertyId={props.propertyId} feed={feed} />
          ))}
        </ul>
      )}

      <div className="rounded-card border border-line bg-paper p-4">
        <h2 className="text-[16px] font-semibold text-ink">Collega un calendario</h2>
        <p className="mt-1 text-body-sm text-ink-mute">
          Incolla il link iCal che esporti da Booking o Airbnb. Il link è una credenziale: non
          condividerlo.
        </p>
        <form className="mt-4 flex flex-col gap-3" action={handleAdd}>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as IcalSource['source'])}
            className={INPUT_CLS}
          >
            <option value="booking">Booking</option>
            <option value="airbnb">Airbnb</option>
            <option value="channel_manager">Channel manager</option>
          </select>
          {source === 'channel_manager' ? (
            <input
              type="text"
              value={cmName}
              onChange={(e) => setCmName(e.target.value)}
              placeholder="Nome (es. Smoobu)"
              className={INPUT_CLS}
            />
          ) : null}
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setProbe(null);
            }}
            required
            placeholder="https://ical.booking.com/v1/export?t=…"
            className={INPUT_CLS}
          />
          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={verifying || url.trim().length === 0}
              onClick={() => startVerify(async () => setProbe(await verifyFeedAction(url)))}
              className="text-body-sm font-medium text-terracotta-2 underline-offset-2 hover:underline disabled:opacity-60"
            >
              {verifying ? 'Verifico…' : 'Verifica feed'}
            </button>
            <button
              type="submit"
              disabled={adding}
              className="inline-flex h-11 items-center justify-center rounded-full bg-terracotta px-6 text-body-sm font-medium text-paper shadow-md transition-colors hover:bg-terracotta-2 disabled:cursor-wait disabled:opacity-60"
            >
              {adding ? 'Collego…' : 'Collega calendario'}
            </button>
          </div>
          {probe ? (
            <p className={`text-body-sm ${probe.ok ? 'text-ink-soft' : 'text-terracotta-2'}`}>
              {probeLabel(probe)}
            </p>
          ) : null}
          {addError ? <p className="text-body-sm text-terracotta-2">{addError}</p> : null}
        </form>
      </div>
    </div>
  );
}
