import { BackLink } from '@/components/BackLink';
import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { hosts } from '@premura/db';
import { eq } from 'drizzle-orm';
import { saveWelcomeSettingsAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const [row] = await db
    .select({
      welcomeAutoSend: hosts.welcomeAutoSend,
      welcomeTimeSlot: hosts.welcomeTimeSlot,
    })
    .from(hosts)
    .where(eq(hosts.id, hostId))
    .limit(1);

  const welcomeAutoSend = row?.welcomeAutoSend ?? true;
  const welcomeTimeSlot = row?.welcomeTimeSlot ?? '08:00';

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl bg-ivory px-5 pt-12 pb-16 lg:max-w-5xl">
      <BackLink href="/dashboard">Oggi</BackLink>
      <header className="mb-8">
        <p className="text-eyebrow uppercase text-ink-mute">Impostazioni</p>
        <h1 className="mt-2 font-serif text-h1 leading-tight tracking-tight text-ink">
          Agent Premura
        </h1>
        <p className="mt-3 text-body-lg text-ink-soft">
          Controllo automazioni di Premura. Default sicuri, modifica solo quello che vuoi gestire
          diversamente.
        </p>
      </header>

      <form
        action={saveWelcomeSettingsAction}
        className="rounded-card border border-line bg-paper p-5"
      >
        <h2 className="text-body font-medium text-ink">Welcome message check-in</h2>
        <p className="mt-1 text-body-sm text-ink-mute">
          La mattina del check-in, Premura manda al guest WhatsApp con la foto del kit setup +
          messaggio personalizzato.
        </p>

        <label className="mt-5 flex items-center justify-between gap-3 rounded-card border border-line bg-bg-soft px-4 py-3">
          <span className="text-body text-ink">Auto-send welcome message</span>
          <input
            type="checkbox"
            name="welcomeAutoSend"
            defaultChecked={welcomeAutoSend}
            className="size-5 accent-terracotta"
          />
        </label>

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-body-sm font-medium text-ink-soft">Ora preferita</span>
          <span className="text-body-sm text-ink-mute">
            Tra le 08:00 e 11:30 Europe/Rome, step 30 minuti. Premura proverà a inviare dal time
            slot indicato in poi.
          </span>
          <select
            name="welcomeTimeSlot"
            defaultValue={welcomeTimeSlot}
            className="mt-1 h-11 rounded-card border border-line bg-paper px-3 text-body text-ink focus:border-terracotta-soft focus:outline-none"
          >
            {generateTimeSlots().map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-terracotta px-5 text-body-sm font-medium text-paper shadow-sm transition-colors hover:bg-terracotta-2"
        >
          Salva impostazioni
        </button>
      </form>
    </main>
  );
}

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 8; h <= 11; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}
