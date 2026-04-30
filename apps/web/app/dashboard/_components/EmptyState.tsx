// Stato calmo: 0 prenotazioni da completare. Sostituisce IncompleteAlert.
// Tono Premura (vedi CONTEXT.md sezione 6 voice): rassicurante, niente
// elenchi, niente call-to-action urgenti.

export function EmptyState() {
  return (
    <div
      role="status"
      className="mx-5 mt-2 rounded-card border border-line-soft bg-paper px-5 py-6 text-left"
    >
      <p className="font-serif text-h3 leading-tight text-ink">
        Tutte le prenotazioni sono complete.
      </p>
      <p className="mt-2 text-body text-ink-soft">
        Premura puo lavorare in autonomia.
      </p>
    </div>
  );
}
