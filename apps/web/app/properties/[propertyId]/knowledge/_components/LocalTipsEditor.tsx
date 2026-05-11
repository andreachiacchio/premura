'use client';

import { useState, useTransition } from 'react';
import { saveLocalTipsAction } from '../actions';

const CATEGORIES = [
  { value: 'pasticceria', label: 'Pasticceria' },
  { value: 'ristorante', label: 'Ristorante' },
  { value: 'bar', label: 'Bar / Caffetteria' },
  { value: 'panorama', label: 'Panorama' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'farmacia', label: 'Farmacia' },
  { value: 'altro', label: 'Altro' },
] as const;

type Category = (typeof CATEGORIES)[number]['value'];

export type LocalTipUI = {
  category: Category;
  name: string;
  description?: string;
  address?: string;
  distanceMin?: number;
};

const EMPTY_TIP: LocalTipUI = { category: 'altro', name: '' };

export function LocalTipsEditor({
  propertyId,
  initial,
}: {
  propertyId: string;
  initial: LocalTipUI[];
}): React.JSX.Element {
  const [tips, setTips] = useState<LocalTipUI[]>(initial.length > 0 ? initial : []);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update(idx: number, patch: Partial<LocalTipUI>): void {
    setTips((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  function add(): void {
    setTips((prev) => [...prev, { ...EMPTY_TIP }]);
  }

  function remove(idx: number): void {
    setTips((prev) => prev.filter((_, i) => i !== idx));
  }

  function move(idx: number, dir: -1 | 1): void {
    setTips((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[idx];
      const swap = next[target];
      if (!tmp || !swap) return prev;
      next[idx] = swap;
      next[target] = tmp;
      return next;
    });
  }

  function handleSave(): void {
    setError(null);
    const valid = tips.filter((t) => t.name.trim().length > 0);
    if (valid.length === 0) {
      setError('Almeno 1 posto richiesto.');
      return;
    }
    startTransition(async () => {
      try {
        await saveLocalTipsAction(propertyId, valid);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Errore salvataggio.');
      }
    });
  }

  const valid = tips.filter((t) => t.name.trim().length > 0).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-ink-soft">
        I posti curati da te. Saranno usati da Premura per i kit di benvenuto e i messaggi guest.
        Almeno 3 raccomandati.
      </p>

      {error && (
        <div className="rounded-md border border-terracotta-2/40 bg-peach px-3 py-2 text-body-sm text-terracotta-2">
          {error}
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {tips.map((tip, idx) => (
          <li
            key={`${idx}-${tip.category}`}
            className="rounded-card border border-line bg-paper p-3"
          >
            <div className="flex items-start gap-2">
              <div className="flex flex-col gap-2 mr-2">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="text-ink-mute hover:text-ink disabled:opacity-30"
                  aria-label="Sposta su"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === tips.length - 1}
                  className="text-ink-mute hover:text-ink disabled:opacity-30"
                  aria-label="Sposta giù"
                >
                  ↓
                </button>
              </div>
              <div className="flex-1 grid gap-2 sm:grid-cols-2">
                <select
                  value={tip.category}
                  onChange={(e) => update(idx, { category: e.target.value as Category })}
                  className={inputCls}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  value={tip.name}
                  onChange={(e) => update(idx, { name: e.target.value })}
                  placeholder="Es. Scaturchio"
                  className={inputCls}
                />
                <input
                  value={tip.address ?? ''}
                  onChange={(e) => update(idx, { address: e.target.value })}
                  placeholder="Indirizzo (opz.)"
                  className={inputCls}
                />
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={tip.distanceMin ?? ''}
                  onChange={(e) =>
                    update(idx, {
                      distanceMin: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="Distanza (min)"
                  className={inputCls}
                />
                <textarea
                  value={tip.description ?? ''}
                  onChange={(e) => update(idx, { description: e.target.value })}
                  rows={2}
                  placeholder="Note (opz., max 280 char)"
                  className={`${inputCls} sm:col-span-2`}
                  maxLength={280}
                />
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="text-terracotta-2 hover:underline ml-2 text-body-sm"
              >
                Rimuovi
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={add}
          className="rounded-card border border-line bg-paper px-3 py-2 text-body-sm text-ink hover:border-terracotta"
        >
          + Aggiungi posto
        </button>
        <span className="text-body-sm text-ink-mute">{valid} validi</span>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="self-start rounded-full bg-terracotta px-5 py-2 text-body-sm font-medium text-paper shadow-sm transition-colors hover:bg-terracotta-2 disabled:opacity-60"
      >
        {pending ? 'Salvataggio…' : 'Salva posti'}
      </button>
    </div>
  );
}

const inputCls =
  'rounded-card border border-line bg-paper px-2 py-1.5 text-body-sm text-ink focus:border-terracotta-soft focus:outline-none';
