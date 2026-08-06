// Stato vuoto riutilizzabile.
//
// REGOLA (Andrea 06/08): lo stato vuoto dice cosa Premura sta facendo o
// non facendo, NON celebra un successo che non c'e'. "Nessun arrivo in
// programma" e' un'informazione; "Tutto perfetto!" e' una pacca sulla
// spalla per qualcosa che non e' successo — ed e' la stessa bugia della
// agent card che diceva "tutto tranquillo" senza aver guardato.
//
// Da qui deriva la forma: una frase che descrive lo stato, e al massimo
// una riga che dice cosa succede dopo. Niente illustrazioni, niente
// bottoni urgenti, niente esclamativi.

export type EmptyStateProps = {
  /** La frase principale. Descrive lo stato, non lo celebra. */
  children: React.ReactNode;
  /** Riga secondaria: cosa fa Premura adesso. Opzionale. */
  hint?: React.ReactNode;
  /** Azione, solo quando esiste davvero qualcosa da fare. */
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  children,
  hint,
  action,
  className = '',
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      className={`rounded-card border border-line-soft bg-paper px-5 py-6 text-left ${className}`}
    >
      <p className="font-serif text-h4 leading-snug text-ink">{children}</p>
      {hint ? <p className="mt-2 text-body text-ink-soft">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export default EmptyState;
