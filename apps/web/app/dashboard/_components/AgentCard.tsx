import type { AgentStatus } from '@/lib/repositories/agent-status';

function Stat({ num, label }: { num: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-serif text-[22px] font-medium text-[#f6f1ea] tabular-nums">{num}</span>
      <span className="text-[11px] uppercase tracking-[0.14em] text-[#f6f1ea]/55">{label}</span>
    </div>
  );
}

export function AgentCard({
  status,
  stats,
}: {
  status: AgentStatus;
  stats: { activeGuests: number; needsYou: number };
}) {
  return (
    <section
      aria-label="Premura sta lavorando"
      className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#12151c] p-6 text-[#f6f1ea] shadow-[0_30px_60px_-36px_rgb(0_0_0/0.45)]"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e0b080]">
        Premura sta lavorando
      </p>
      <p className="mt-3 font-serif text-[28px] leading-[1.15] tracking-[-0.02em] md:text-[32px]">
        {status.action}
      </p>
      {status.sub ? <p className="mt-2 text-body text-[#f6f1ea]/65">{status.sub}</p> : null}
      <div className="mt-6 flex gap-8 border-t border-white/10 pt-4">
        <Stat num={stats.activeGuests} label="In casa" />
        <Stat num={stats.needsYou} label="Serve te" />
      </div>
    </section>
  );
}
