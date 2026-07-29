'use client';

import { useMemo, useState } from 'react';

// Blocco 3 della home — "Fatto dall'agente".
//
// Feed cronologico: ora + una riga in linguaggio host, oggi in chiaro,
// ieri e oltre dietro "Mostra tutto". Le righe arrivano dal server gia'
// composte (lib/repositories/home-summary.ts) — qui solo presentazione.

const TIME_FMT = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
const DAY_FMT = new Intl.DateTimeFormat('it-IT', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

export type FeedItemUI = {
  at: string; // ISO
  line: string;
  kind: 'send' | 'reply' | 'inquiry';
  simulated: boolean;
};

const KIND_DOT: Record<FeedItemUI['kind'], string> = {
  send: 'bg-ok',
  reply: 'bg-gold-deep',
  inquiry: 'bg-terracotta',
};

function FeedLine({ item, showDay }: { item: FeedItemUI; showDay: boolean }): React.JSX.Element {
  const at = new Date(item.at);
  return (
    <li className="flex items-baseline gap-3 border-t border-line-soft px-4 py-2.5 first:border-t-0">
      <span className="w-14 shrink-0 font-mono text-[12px] text-ink-mute">
        {showDay ? DAY_FMT.format(at) : TIME_FMT.format(at)}
      </span>
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${KIND_DOT[item.kind]}`} />
      <span className="text-body-sm text-ink">
        {item.line}
        {item.simulated ? (
          <span className="text-ink-mute"> · prova, non inviato davvero</span>
        ) : null}
      </span>
    </li>
  );
}

export function AgentFeed({ items }: { items: FeedItemUI[] }): React.JSX.Element {
  const [showAll, setShowAll] = useState(false);

  const { today, earlier } = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const t: FeedItemUI[] = [];
    const e: FeedItemUI[] = [];
    for (const item of items) {
      (new Date(item.at) >= startOfToday ? t : e).push(item);
    }
    return { today: t, earlier: e };
  }, [items]);

  return (
    <section aria-label="Fatto dall'agente" className="mx-5 mt-5">
      <h2 className="mb-2 text-eyebrow uppercase tracking-wider text-ink-mute">
        Fatto dall'agente — oggi
      </h2>
      <div className="overflow-hidden rounded-card border border-line bg-paper shadow-sm">
        {today.length === 0 ? (
          <p className="px-4 py-5 text-body-sm text-ink-mute">
            Ancora niente oggi. Benvenuti, survey e risposte compariranno qui appena partono.
          </p>
        ) : (
          <ul>
            {today.map((item) => (
              <FeedLine key={`${item.at}-${item.line}`} item={item} showDay={false} />
            ))}
          </ul>
        )}

        {earlier.length > 0 ? (
          <div className="border-t border-line-soft">
            {showAll ? (
              <ul>
                {earlier.map((item) => (
                  <FeedLine key={`${item.at}-${item.line}`} item={item} showDay />
                ))}
              </ul>
            ) : (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full px-4 py-2.5 text-left text-body-sm font-medium text-ink-mute hover:bg-ivory hover:text-ink-soft"
              >
                Mostra tutto ({earlier.length} nei giorni scorsi)
              </button>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
