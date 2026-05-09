'use client';

import type { KitItem, KitModification } from '@premura/db';
import { useState, useTransition } from 'react';
import { approveKitAction, modifyKitItemsAction, rejectKitAction } from '../../actions';

const FONTE_LABELS: Record<string, string> = {
  amazon: 'Amazon Business',
  glovo: 'Glovo',
  manual_print: 'Stampa manuale',
  manual_write: 'Scritto a mano',
};

const LEAD_LABELS: Record<string, string> = {
  same_day: 'same-day',
  '1_hour': '1h',
  '1_day': '1g',
  '2_days': '2g',
};

export type KitDetailUI = {
  kitId: string;
  bookingId: string;
  status: string;
  items: KitItem[];
  theme: string | null;
  storytellingIt: string | null;
  storytellingEn: string | null;
  rationale: string | null;
  cardMessage: string | null;
  cardMessageEn: string | null;
  budgetEur: string;
  itemsTotalEur: string | null;
  proposalGeneratedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  modificationLog: KitModification[];
  generatorAgentVersion: string | null;
  generatorCostUsd: string | null;
  guestLanguage: string;
  cleanerBriefedAt: string | null;
  cleanerAcceptedAt: string | null;
  cleanerPlacedAt: string | null;
  cleanerPhotoUrl: string | null;
  guestConfirmedAt: string | null;
  guestFirstName: string | null;
  checkinAt: string;
  checkoutAt: string;
};

export function KitDetail({ kit }: { kit: KitDetailUI }): React.JSX.Element {
  const isPending = kit.status === 'proposed' || kit.status === 'modified';
  const [editMode, setEditMode] = useState(false);
  const [items, setItems] = useState<KitItem[]>(kit.items);
  const [theme, setTheme] = useState(kit.theme ?? '');
  const [cardMessage, setCardMessage] = useState(kit.cardMessage ?? '');
  const [cardMessageEn, setCardMessageEn] = useState(kit.cardMessageEn ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  function handleApprove(): void {
    setError(null);
    startTransition(async () => {
      const r = await approveKitAction(kit.kitId);
      if (!r.ok) setError(`Approvazione fallita: ${r.reason}`);
    });
  }

  function handleReject(): void {
    if (rejectReason.trim().length < 2) {
      setError('Inserisci un motivo (min 2 caratteri).');
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await rejectKitAction(kit.kitId, rejectReason.trim());
      if (!r.ok) setError(`Rifiuto fallito: ${r.reason}`);
    });
  }

  function handleSaveModifications(): void {
    setError(null);
    startTransition(async () => {
      const r = await modifyKitItemsAction(kit.kitId, {
        items,
        theme: theme || undefined,
        cardMessage: cardMessage || undefined,
        cardMessageEn: cardMessageEn || undefined,
      });
      if (!r.ok) setError(`Modifica fallita: ${r.reason}`);
      else setEditMode(false);
    });
  }

  function updateItem<K extends keyof KitItem>(
    idx: number,
    field: K,
    value: KitItem[K],
  ): void {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    );
  }

  function removeItem(idx: number): void {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded-md border border-terracotta-2/40 bg-peach px-3 py-2 text-sm text-terracotta-2">
          {error}
        </div>
      )}

      {kit.status === 'rejected' && kit.rejectionReason && (
        <section className="mb-4 rounded-md border border-terracotta-2/40 bg-peach px-3 py-2">
          <h3 className="text-xs font-medium text-terracotta-2">Motivo rifiuto</h3>
          <p className="mt-1 text-sm">{kit.rejectionReason}</p>
        </section>
      )}

      <section className="mb-6 rounded-lg border border-line bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink-mute">Tema</h2>
          {editMode && (
            <span className="text-xs text-ink-mute">in modifica</span>
          )}
        </div>
        {editMode ? (
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-terracotta focus:outline-none"
            placeholder="Es. Coppia anniversario, prima volta Napoli"
          />
        ) : (
          <p className="text-base font-medium text-ink">{kit.theme ?? '—'}</p>
        )}
      </section>

      {kit.storytellingIt && (
        <section className="mb-6 rounded-lg border border-line bg-bg-soft p-4">
          <h2 className="mb-2 text-sm font-medium text-ink-mute">
            Storytelling ({kit.guestLanguage === 'en' ? 'EN' : 'IT'})
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
            {kit.guestLanguage === 'en'
              ? kit.storytellingEn ?? kit.storytellingIt
              : kit.storytellingIt}
          </p>
        </section>
      )}

      <section className="mb-6 rounded-lg border border-line bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium text-ink">
            Items ({items.length})
          </h2>
          <div className="text-sm text-ink-mute">
            €{kit.itemsTotalEur ?? '?'} / €{kit.budgetEur}
          </div>
        </div>
        <ul className="space-y-3">
          {items.map((item, idx) => (
            <li
              key={`${item.taxonomyKey}-${idx}`}
              className="rounded-md border border-line p-3"
            >
              {editMode ? (
                <div className="space-y-2">
                  <input
                    value={item.specificDescription ?? ''}
                    onChange={(e) =>
                      updateItem(idx, 'specificDescription', e.target.value)
                    }
                    className="w-full rounded border border-line px-2 py-1 text-sm"
                  />
                  <div className="flex flex-wrap gap-2 text-xs">
                    <label className="flex items-center gap-1">
                      Qty
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={item.quantity ?? 1}
                        onChange={(e) =>
                          updateItem(idx, 'quantity', Number(e.target.value))
                        }
                        className="w-14 rounded border border-line px-1 py-0.5"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      €
                      <input
                        type="number"
                        step={0.5}
                        min={0}
                        max={100}
                        value={item.estimatedPriceEur ?? 0}
                        onChange={(e) =>
                          updateItem(
                            idx,
                            'estimatedPriceEur',
                            Number(e.target.value),
                          )
                        }
                        className="w-20 rounded border border-line px-1 py-0.5"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="ml-auto text-terracotta-2 hover:underline"
                    >
                      Rimuovi
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {item.specificDescription ?? item.taxonomyKey ?? '?'}
                      </p>
                      <p className="text-xs text-ink-mute">
                        {item.taxonomyKey} · {item.fonte ? FONTE_LABELS[item.fonte] : '—'} ·{' '}
                        {item.leadTime ? LEAD_LABELS[item.leadTime] : '—'}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <span className="font-medium">
                        {item.quantity ?? 1}× €{item.estimatedPriceEur?.toFixed(2) ?? '?'}
                      </span>
                    </div>
                  </div>
                  {item.reasoning && (
                    <p className="mt-1 text-xs text-ink-mute">
                      <em>{item.reasoning}</em>
                    </p>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-white p-4">
          <h2 className="mb-2 text-sm font-medium text-ink-mute">
            Card message IT
          </h2>
          {editMode ? (
            <textarea
              value={cardMessage}
              onChange={(e) => setCardMessage(e.target.value)}
              maxLength={300}
              rows={3}
              className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-terracotta focus:outline-none"
            />
          ) : (
            <p className="whitespace-pre-line text-sm">{kit.cardMessage ?? '—'}</p>
          )}
        </div>
        <div className="rounded-lg border border-line bg-white p-4">
          <h2 className="mb-2 text-sm font-medium text-ink-mute">
            Card message EN
          </h2>
          {editMode ? (
            <textarea
              value={cardMessageEn}
              onChange={(e) => setCardMessageEn(e.target.value)}
              maxLength={300}
              rows={3}
              className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-terracotta focus:outline-none"
            />
          ) : (
            <p className="whitespace-pre-line text-sm">{kit.cardMessageEn ?? '—'}</p>
          )}
        </div>
      </section>

      {kit.rationale && (
        <section className="mb-6 rounded-lg border border-line bg-bg-soft p-4">
          <h2 className="mb-2 text-sm font-medium text-ink-mute">Rationale agent</h2>
          <p className="whitespace-pre-line text-xs text-ink-mute">{kit.rationale}</p>
        </section>
      )}

      {isPending && (
        <section className="sticky bottom-0 mt-6 flex flex-wrap gap-3 border-t border-line bg-white py-4">
          {!editMode && !rejectMode && (
            <>
              <button
                type="button"
                onClick={handleApprove}
                disabled={pending}
                className="rounded-md bg-terracotta px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-terracotta-2 disabled:opacity-60"
              >
                {pending ? 'Approvazione…' : 'Approva e procedi'}
              </button>
              <button
                type="button"
                onClick={() => setEditMode(true)}
                disabled={pending}
                className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:border-terracotta"
              >
                Modifica
              </button>
              <button
                type="button"
                onClick={() => setRejectMode(true)}
                disabled={pending}
                className="rounded-md border border-terracotta-2/40 bg-peach px-4 py-2 text-sm font-medium text-terracotta-2 hover:bg-peach"
              >
                Rifiuta
              </button>
            </>
          )}
          {editMode && (
            <>
              <button
                type="button"
                onClick={handleSaveModifications}
                disabled={pending}
                className="rounded-md bg-terracotta px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-terracotta-2 disabled:opacity-60"
              >
                {pending ? 'Salvataggio…' : 'Salva modifiche'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditMode(false);
                  setItems(kit.items);
                  setTheme(kit.theme ?? '');
                  setCardMessage(kit.cardMessage ?? '');
                  setCardMessageEn(kit.cardMessageEn ?? '');
                }}
                className="rounded-md border border-line bg-white px-4 py-2 text-sm text-ink-mute hover:text-ink"
              >
                Annulla
              </button>
            </>
          )}
          {rejectMode && (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex-1">
                <span className="text-xs text-ink-mute">Motivo rifiuto</span>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm focus:border-terracotta focus:outline-none"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={pending}
                  className="rounded-md bg-terracotta-2 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
                >
                  Conferma rifiuto
                </button>
                <button
                  type="button"
                  onClick={() => setRejectMode(false)}
                  className="rounded-md border border-line bg-white px-4 py-2 text-sm text-ink-mute hover:text-ink"
                >
                  Annulla
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {kit.modificationLog.length > 0 && (
        <details className="mt-8 rounded-lg border border-line bg-bg-soft p-4">
          <summary className="cursor-pointer text-sm text-ink-mute">
            Audit modifiche ({kit.modificationLog.length})
          </summary>
          <ul className="mt-3 space-y-2 text-xs">
            {kit.modificationLog.map((mod, i) => (
              <li key={i} className="border-l-2 border-line pl-3">
                <p className="font-medium">{mod.field}</p>
                <p className="text-ink-mute">{mod.modifiedAt}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {kit.generatorAgentVersion && (
        <p className="mt-6 text-[11px] text-ink-mute">
          Agent {kit.generatorAgentVersion} · costo $
          {kit.generatorCostUsd ?? '0'}
        </p>
      )}
    </>
  );
}
