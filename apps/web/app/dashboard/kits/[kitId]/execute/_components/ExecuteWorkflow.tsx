'use client';

import { useState, useTransition } from 'react';
import {
  markCleanerBriefedAction,
  toggleItemExecutedAction,
  updateKitStatusAction,
} from '../../../actions';

export type AmazonGlovoItemUI = {
  idx: number;
  description: string;
  quantity: number;
  estimatedPriceEur: number;
  searchHint: string;
  searchUrl: string;
  executedAt: string | null;
  reasoning: string;
};

export type ManualItemUI = {
  idx: number;
  description: string;
  fonte: string;
  cardMessage: string | null;
  executedAt: string | null;
  reasoning: string;
};

export type ExecuteWorkflowProps = {
  kitId: string;
  currentStatus: string;
  amazonItems: AmazonGlovoItemUI[];
  glovoItems: AmazonGlovoItemUI[];
  manualItems: ManualItemUI[];
  amazonOrderByDateFmt: string;
  cleanerBriefedAt: string | null;
  cleanerAcceptedAt: string | null;
};

export function ExecuteWorkflow(props: ExecuteWorkflowProps): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Stato locale per gli executedAt (optimistic update prima del revalidate).
  const [amazonState, setAmazonState] = useState(props.amazonItems);
  const [glovoState, setGlovoState] = useState(props.glovoItems);
  const [manualState, setManualState] = useState(props.manualItems);

  function toggleItem(
    idx: number,
    setter: 'amazon' | 'glovo' | 'manual',
  ): void {
    setError(null);
    startTransition(async () => {
      const r = await toggleItemExecutedAction(props.kitId, idx);
      if (!r.ok) {
        setError(`Toggle fallito: ${r.reason}`);
        return;
      }
      const nowIso = new Date().toISOString();
      const flip = (
        items: AmazonGlovoItemUI[] | ManualItemUI[],
      ): (AmazonGlovoItemUI | ManualItemUI)[] =>
        (items as { idx: number; executedAt: string | null }[]).map((it) =>
          it.idx === idx ? { ...it, executedAt: it.executedAt ? null : nowIso } : it,
        ) as (AmazonGlovoItemUI | ManualItemUI)[];
      if (setter === 'amazon') setAmazonState(flip(amazonState) as AmazonGlovoItemUI[]);
      if (setter === 'glovo') setGlovoState(flip(glovoState) as AmazonGlovoItemUI[]);
      if (setter === 'manual') setManualState(flip(manualState) as ManualItemUI[]);
    });
  }

  const allItems = [...amazonState, ...glovoState, ...manualState];
  const allExecuted = allItems.length > 0 && allItems.every((it) => it.executedAt);
  const briefed = !!props.cleanerBriefedAt;
  const accepted = !!props.cleanerAcceptedAt;

  function handleNotifyKaren(): void {
    setError(null);
    startTransition(async () => {
      const r = await markCleanerBriefedAction(props.kitId);
      if (!r.ok) setError(`Invio brief fallito: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
    });
  }

  function handleStatusUpdate(newStatus: string): void {
    setError(null);
    startTransition(async () => {
      const r = await updateKitStatusAction(props.kitId, newStatus);
      if (!r.ok) setError(`Aggiornamento stato fallito: ${r.reason}`);
    });
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded-md border border-terracotta-2/40 bg-peach px-3 py-2 text-sm text-terracotta-2">
          {error}
        </div>
      )}

      <h2 className="mb-3 text-base font-medium text-ink">Cosa devi fare adesso</h2>

      {amazonState.length > 0 && (
        <SourceCard
          icon="🛒"
          title={`Amazon Business (${amazonState.length} item${amazonState.length === 1 ? '' : 's'})`}
          deadline={`Ordina entro ${props.amazonOrderByDateFmt}`}
        >
          {amazonState.map((it) => (
            <ItemRow
              key={it.idx}
              description={it.description}
              quantity={it.quantity}
              estimatedPriceEur={it.estimatedPriceEur}
              extra={
                <>
                  <p className="mt-1 text-xs text-ink-mute">
                    Cerca: <code>{it.searchHint}</code>
                  </p>
                  <a
                    href={it.searchUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-ink hover:border-terracotta"
                  >
                    🔍 Apri Amazon Business →
                  </a>
                </>
              }
              executedAt={it.executedAt}
              onToggle={() => toggleItem(it.idx, 'amazon')}
              disabled={pending}
            />
          ))}
        </SourceCard>
      )}

      {glovoState.length > 0 && (
        <SourceCard
          icon="🚲"
          title={`Glovo (${glovoState.length} item${glovoState.length === 1 ? '' : 's'})`}
          deadline="Ordina mattina del check-in"
        >
          {glovoState.map((it) => (
            <ItemRow
              key={it.idx}
              description={it.description}
              quantity={it.quantity}
              estimatedPriceEur={it.estimatedPriceEur}
              extra={
                <>
                  <p className="mt-1 text-xs text-ink-mute">
                    Search hint: <code>{it.searchHint}</code>
                  </p>
                  <a
                    href={it.searchUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-ink hover:border-terracotta"
                  >
                    📱 Apri Glovo
                  </a>
                </>
              }
              executedAt={it.executedAt}
              onToggle={() => toggleItem(it.idx, 'glovo')}
              disabled={pending}
            />
          ))}
        </SourceCard>
      )}

      {manualState.length > 0 && (
        <SourceCard
          icon="✋"
          title={`Manuali (${manualState.length} item${manualState.length === 1 ? '' : 's'})`}
          deadline="Prepara tu o briefa Karen"
        >
          {manualState.map((it) => (
            <ItemRow
              key={it.idx}
              description={it.description}
              quantity={1}
              estimatedPriceEur={0}
              extra={
                <>
                  {it.fonte === 'manual_write' && it.cardMessage && (
                    <p className="mt-1 text-xs text-ink-mute">
                      Karen scrivera':{' '}
                      <em>"{it.cardMessage}"</em>
                    </p>
                  )}
                  {it.fonte === 'manual_print' && (
                    <p className="mt-1 text-xs text-ink-mute">
                      Stampa A4 o A5 (placeholder V1, niente PDF auto-gen).
                    </p>
                  )}
                </>
              }
              executedAt={it.executedAt}
              onToggle={() => toggleItem(it.idx, 'manual')}
              disabled={pending}
              hidePrice
            />
          ))}
        </SourceCard>
      )}

      {/* CTA "Tutto ordinato → notifica Karen" */}
      {!briefed && (
        <div className="sticky bottom-0 mt-6 border-t border-line bg-white py-4">
          <button
            type="button"
            onClick={handleNotifyKaren}
            disabled={!allExecuted || pending}
            className="w-full rounded-md bg-terracotta px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-terracotta-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            🚀 Tutto ordinato → notifica Karen
          </button>
          {!allExecuted && (
            <p className="mt-2 text-center text-xs text-ink-mute">
              Spunta tutti gli item per attivare il pulsante.
            </p>
          )}
        </div>
      )}

      {briefed && (
        <section className="mt-6 rounded-lg border border-line bg-bg-soft p-4">
          <p className="text-sm text-ink">
            ✅ Karen e' stata notificata{' '}
            {props.cleanerBriefedAt
              ? `il ${new Date(props.cleanerBriefedAt).toLocaleString('it-IT')}`
              : ''}
            .
          </p>
          {accepted ? (
            <p className="mt-1 text-sm text-ok">
              👍 Karen ha confermato il brief.
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-mute">
              In attesa della conferma di Karen su WhatsApp…
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <NextStatusButton
              currentStatus={props.currentStatus}
              targetStatus="in_transit"
              label="Marca: in transito"
              onClick={handleStatusUpdate}
              disabled={pending}
            />
            <NextStatusButton
              currentStatus={props.currentStatus}
              targetStatus="arrived_at_locker"
              label="Marca: arrivato locker"
              onClick={handleStatusUpdate}
              disabled={pending}
            />
            <NextStatusButton
              currentStatus={props.currentStatus}
              targetStatus="picked_up_by_cleaner"
              label="Marca: ritirato cleaner"
              onClick={handleStatusUpdate}
              disabled={pending}
            />
            <NextStatusButton
              currentStatus={props.currentStatus}
              targetStatus="set_up"
              label="Marca: allestito (foto)"
              onClick={handleStatusUpdate}
              disabled={pending}
            />
            <NextStatusButton
              currentStatus={props.currentStatus}
              targetStatus="delivered_to_guest"
              label="Marca: consegnato"
              onClick={handleStatusUpdate}
              disabled={pending}
            />
          </div>
        </section>
      )}
    </>
  );
}

function SourceCard({
  icon,
  title,
  deadline,
  children,
}: {
  icon: string;
  title: string;
  deadline: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="mb-4 rounded-lg border border-line bg-white p-4">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">
          {icon} {title}
        </h3>
        <p className="text-xs text-ink-mute">{deadline}</p>
      </header>
      <ul className="space-y-3">{children}</ul>
    </section>
  );
}

function ItemRow({
  description,
  quantity,
  estimatedPriceEur,
  extra,
  executedAt,
  onToggle,
  disabled,
  hidePrice,
}: {
  description: string;
  quantity: number;
  estimatedPriceEur: number;
  extra: React.ReactNode;
  executedAt: string | null;
  onToggle: () => void;
  disabled: boolean;
  hidePrice?: boolean;
}): React.JSX.Element {
  const done = !!executedAt;
  return (
    <li
      className={`rounded-md border p-3 transition-colors ${
        done ? 'border-ok/30 bg-line-soft' : 'border-line'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${done ? 'text-ink-mute line-through' : 'text-ink'}`}>
            {description}
            {!hidePrice && (
              <span className="ml-1 text-xs text-ink-mute">
                ({quantity}× €{estimatedPriceEur.toFixed(2)})
              </span>
            )}
          </p>
          {extra}
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
            done
              ? 'bg-ok/10 text-ok hover:bg-ok/20'
              : 'border border-line bg-white text-ink hover:border-terracotta'
          }`}
        >
          {done ? '✓ Ordinato' : 'Marca ordinato'}
        </button>
      </div>
    </li>
  );
}

const ALLOWED_NEXT: Record<string, string[]> = {
  approved: ['ordering'],
  ordering: ['in_transit', 'arrived_at_locker', 'picked_up_by_cleaner'],
  in_transit: ['arrived_at_locker'],
  arrived_at_locker: ['picked_up_by_cleaner'],
  picked_up_by_cleaner: ['set_up'],
  set_up: ['delivered_to_guest'],
};

function NextStatusButton({
  currentStatus,
  targetStatus,
  label,
  onClick,
  disabled,
}: {
  currentStatus: string;
  targetStatus: string;
  label: string;
  onClick: (s: string) => void;
  disabled: boolean;
}): React.JSX.Element | null {
  const allowed = ALLOWED_NEXT[currentStatus] ?? [];
  if (!allowed.includes(targetStatus)) return null;
  return (
    <button
      type="button"
      onClick={() => onClick(targetStatus)}
      disabled={disabled}
      className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-terracotta disabled:opacity-60"
    >
      {label}
    </button>
  );
}
