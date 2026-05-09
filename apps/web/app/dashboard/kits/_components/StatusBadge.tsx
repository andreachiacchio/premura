// Slice C — Badge stato kit. Mappa enum → label IT + colore.

const STATUS_META: Record<string, { label: string; cls: string }> = {
  // Slice C statuses
  pending_survey: { label: 'In attesa survey', cls: 'bg-line-soft text-ink-mute' },
  proposed: { label: 'Da approvare', cls: 'bg-gold-soft text-gold-deep' },
  approved: { label: 'Approvato', cls: 'bg-line-soft text-ok border border-ok/20' },
  rejected: { label: 'Rifiutato', cls: 'bg-peach text-terracotta-2' },
  modified: { label: 'Modificato', cls: 'bg-gold-soft text-gold-deep' },
  ordering: { label: 'In ordine', cls: 'bg-peach text-terracotta-2' },
  in_transit: { label: 'In transito', cls: 'bg-peach text-terracotta-2' },
  arrived_at_locker: { label: 'Arrivato al locker', cls: 'bg-gold-soft text-gold-deep' },
  picked_up_by_cleaner: { label: 'Ritirato cleaner', cls: 'bg-gold-soft text-gold-deep' },
  set_up: { label: 'Allestito', cls: 'bg-line-soft text-ok border border-ok/20' },
  delivered_to_guest: {
    label: 'Consegnato',
    cls: 'bg-line-soft text-ok border border-ok/20',
  },
  // Legacy V1 statuses (fallback)
  pending_dna: { label: 'Pending DNA', cls: 'bg-line-soft text-ink-mute' },
  pending_quiz: { label: 'Pending quiz', cls: 'bg-line-soft text-ink-mute' },
  composing: { label: 'Composing', cls: 'bg-gold-soft text-gold-deep' },
  awaiting_approval: { label: 'Da approvare', cls: 'bg-gold-soft text-gold-deep' },
  ordered: { label: 'Ordinato', cls: 'bg-peach text-terracotta-2' },
  delivered_to_cleaner: { label: 'Da cleaner', cls: 'bg-gold-soft text-gold-deep' },
  placed_in_property: { label: 'Allestito', cls: 'bg-line-soft text-ok border border-ok/20' },
  confirmed_by_guest: {
    label: 'Confermato',
    cls: 'bg-line-soft text-ok border border-ok/20',
  },
  failed: { label: 'Fallito', cls: 'bg-peach text-terracotta-2' },
};

export function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const meta = STATUS_META[status] ?? { label: status, cls: 'bg-line-soft text-ink-mute' };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

export const STATUS_TIMELINE_ORDER = [
  'proposed',
  'approved',
  'ordering',
  'in_transit',
  'arrived_at_locker',
  'picked_up_by_cleaner',
  'set_up',
  'delivered_to_guest',
] as const;

export type TimelineStatus = (typeof STATUS_TIMELINE_ORDER)[number];

export function StatusTimeline({ current }: { current: string }): React.JSX.Element {
  const labels: Record<TimelineStatus, string> = {
    proposed: 'Proposta',
    approved: 'Approvato',
    ordering: 'Ordini',
    in_transit: 'In transito',
    arrived_at_locker: 'Locker',
    picked_up_by_cleaner: 'Ritirato',
    set_up: 'Allestito',
    delivered_to_guest: 'Consegnato',
  };
  const currentIndex = STATUS_TIMELINE_ORDER.indexOf(current as TimelineStatus);
  return (
    <ol className="flex w-full flex-wrap gap-1 text-[11px]">
      {STATUS_TIMELINE_ORDER.map((step, idx) => {
        const isPast = currentIndex >= 0 && idx < currentIndex;
        const isCurrent = idx === currentIndex;
        const cls = isCurrent
          ? 'bg-terracotta text-white'
          : isPast
            ? 'bg-line-soft text-ok'
            : 'bg-bg-soft text-ink-mute';
        return (
          <li
            key={step}
            className={`rounded px-2 py-1 font-medium ${cls}`}
            aria-current={isCurrent ? 'step' : undefined}
          >
            {labels[step]}
          </li>
        );
      })}
    </ol>
  );
}
