// Card peach in stile prototipo .alert-banner (riga 382). Mostrata solo
// quando ci sono prenotazioni Booking incomplete (data_source RICH/INCOMPLETE
// definito da @premura/shared). Sotto la card lo scroll arriva sulla lista
// completa.
//
// Hidden quando count = 0: il caller decide quando renderizzarla.

import { ChevronRight } from 'lucide-react';

export function IncompleteAlert({ count }: { count: number }) {
  if (count === 0) return null;

  const label =
    count === 1
      ? '1 prenotazione Booking da completare'
      : `${count} prenotazioni Booking da completare`;

  return (
    <a
      href="#incomplete"
      className="group mx-5 mt-2 flex items-center gap-3.5 rounded-card border border-terracotta-soft bg-gradient-to-br from-peach to-peach-deep px-4 py-3.5 text-left text-terracotta-2 shadow-sm transition-transform hover:-translate-y-px"
    >
      <span
        aria-hidden
        className="mt-0.5 size-2.5 shrink-0 rounded-full bg-terracotta shadow-[0_0_0_3px_rgba(198,93,58,0.18)]"
      />
      <div className="flex-1">
        <div className="text-[14px] font-semibold leading-tight">{label}</div>
        <div className="mt-0.5 text-body-sm opacity-80">Servono pochi dati per ognuna</div>
      </div>
      <ChevronRight
        aria-hidden
        className="size-[18px] shrink-0 text-terracotta-2 transition-transform group-hover:translate-x-0.5"
      />
    </a>
  );
}
