import { getCurrentHostId } from '@/lib/auth';

export const metadata = {
  title: 'Connetti Gmail — Premura',
  description:
    'Autorizza Premura a leggere solo le email da Airbnb e Booking. Trasparenza totale, revoca con un click.',
};

// Rifacimento (Andrea, 30/07): una gerarchia, niente prosa dove basta
// una riga, azione sempre visibile senza scorrere. Elementi nativi al
// posto del Button condiviso: il bottone principale usciva VUOTO (bug
// del componente polimorfico as="a") — qui un <a> non puo' perdere il
// suo testo.
//
// Dynamic: legge la sessione Supabase a runtime per costruire startHref
// con l'hostId corretto.
export const dynamic = 'force-dynamic';

const POINTS = [
  {
    icon: '✉️',
    title: 'Leggiamo solo due mittenti',
    text:
      'automated@airbnb.com e noreply@booking.com. Le altre email — tua figlia, il commercialista, la newsletter del supermercato — non le vediamo e non le vogliamo.',
  },
  {
    icon: '🔒',
    title: 'Non scriviamo, non cancelliamo, non condividiamo',
    text: 'Accesso in sola lettura. Niente email a nome tuo, niente dati venduti o analizzati.',
  },
  {
    icon: '👁️',
    title: 'Vedi sempre cosa abbiamo letto',
    text: 'Ogni email letta è nella dashboard. Revoca in un click, quando vuoi.',
  },
];

export default async function ConnectGmailPage() {
  const hostId = await getCurrentHostId();
  const startHref = `/api/auth/google/start?hostId=${encodeURIComponent(hostId)}`;

  return (
    <main className="flex min-h-dvh items-start justify-center bg-ivory px-5 py-10 md:items-center">
      <div className="w-full max-w-[560px]">
        <h1 className="font-serif text-[clamp(26px,5vw,36px)] leading-tight text-ink">
          Connetti Gmail a Premura
        </h1>
        <p className="mt-2 text-body text-ink-soft">
          Le prenotazioni arrivano da sole: leggiamo le email di Airbnb e Booking, nient'altro.
        </p>

        <div className="mt-6 divide-y divide-line-soft rounded-card border border-line bg-paper shadow-sm">
          {POINTS.map((p) => (
            <div key={p.title} className="flex gap-3 px-4 py-3.5">
              <span aria-hidden className="text-[18px] leading-6">
                {p.icon}
              </span>
              <div>
                <p className="font-medium text-body text-ink">{p.title}</p>
                <p className="mt-0.5 text-body-sm text-ink-soft">{p.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Avvertenza Google SUBITO SOPRA il pulsante: serve un attimo
            prima del click, non in fondo alla pagina. */}
        <div className="mt-4 rounded-card border border-gold-soft bg-gold-soft/30 px-4 py-3 text-body-sm text-ink-soft">
          Tra un secondo Google dirà &ldquo;Premura vuole leggere i tuoi messaggi Gmail&rdquo; —
          non può dire &ldquo;solo Airbnb e Booking&rdquo;, è un suo limite tecnico. Il nostro
          filtro sui due mittenti parte comunque prima che qualsiasi email arrivi a Premura.
        </div>

        <div className="mt-5 flex flex-col items-center gap-3">
          <a
            href={startHref}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-ink text-[15px] font-medium text-paper shadow-md transition-colors hover:bg-ink/90"
          >
            Continua con Google
          </a>
          <a
            href="/"
            className="text-body-sm text-ink-mute underline-offset-2 hover:text-ink-soft hover:underline"
          >
            Non ora
          </a>
        </div>
      </div>
    </main>
  );
}
