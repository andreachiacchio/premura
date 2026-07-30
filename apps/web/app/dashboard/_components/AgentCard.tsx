import type { AgentStatus } from '@/lib/repositories/agent-status';

// La carta scura "Premura sta lavorando" — il cuore della home nel
// prototipo (demo/premura-prototype.html, .agent-card). E' la voce di
// Premura: azione corrente vera + tre contatori. Server component,
// zero client JS.

function Stat({ num, label }: { num: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-serif text-[18px] font-medium text-gold-soft tabular-nums">{num}</span>
      <span className="text-[11px] uppercase tracking-[0.12em] text-paper/55">{label}</span>
    </div>
  );
}

export function AgentCard({
  status,
  stats,
}: {
  status: AgentStatus;
  stats: { activeGuests: number; actionsToday: number; needsYou: number };
}) {
  return (
    <section
      aria-label="Premura sta lavorando"
      className="relative mx-5 mt-1 overflow-hidden rounded-[24px] bg-gradient-to-br from-ink to-[#2A4A60] p-6 pb-5 text-paper shadow-lg"
    >
      {/* Archi decorativi come nel prototipo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 size-44 rounded-full border border-gold/35"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-5 -top-20 size-56 rounded-full border border-gold/15"
      />

      <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-soft">
        <span aria-hidden className="relative inline-block size-2 rounded-full bg-gold">
          <span className="absolute -inset-1 animate-ping rounded-full border border-gold opacity-40" />
        </span>
        Premura sta lavorando
      </p>

      <p className="mt-3.5 font-serif text-[24px] font-normal leading-[1.3] tracking-[-0.01em]">
        {status.action}
      </p>
      {status.sub ? <p className="mt-2.5 text-[13px] text-paper/70">{status.sub}</p> : null}

      <div className="mt-5 flex items-center justify-between border-t border-paper/10 pt-4">
        <Stat num={stats.activeGuests} label="Ospiti attivi" />
        <Stat num={stats.actionsToday} label="Azioni oggi" />
        <Stat num={stats.needsYou} label="Serve te" />
      </div>
    </section>
  );
}
