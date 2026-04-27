import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Container } from '@/components/Container';
import { Eyebrow } from '@/components/Eyebrow';
import { Heading } from '@/components/Heading';

export const metadata = {
  title: 'Connetti Gmail — Premura',
  description:
    'Autorizza Premura a leggere solo le email da Airbnb e Booking. Trasparenza totale, revoca con un click.',
};

// Dynamic: DEV_HOST_ID è letto da env a runtime (env privata, non NEXT_PUBLIC_),
// quindi la pagina non può essere prerenderata a build time altrimenti il
// valore sarebbe cachato a stringa vuota.
export const dynamic = 'force-dynamic';

// Server Component. Legge DEV_HOST_ID lato server — temporaneo finché
// non c'è auth reale (M2a.2). Non viene esposto al browser.
const DEV_HOST_ID = process.env.DEV_HOST_ID ?? '';

export default function ConnectGmailPage() {
  const startHref = DEV_HOST_ID
    ? `/api/auth/google/start?hostId=${encodeURIComponent(DEV_HOST_ID)}`
    : '/api/auth/google/start';

  return (
    <main className="py-16 md:py-24 min-h-dvh">
      <Container>
        <div className="max-w-lg mx-auto">
          <Eyebrow variant="terracotta">Premura · Gmail</Eyebrow>

          <Heading level={1} soft={50} className="mt-6">
            Connetti Gmail a Premura
          </Heading>

          <p className="mt-6 text-body-lg text-ink-soft">
            Per scrivere messaggi su misura per i tuoi ospiti, Premura ha
            bisogno di leggere le email che ti arrivano da Airbnb e Booking.
          </p>

          <section className="mt-12">
            <Heading level={2}>Cosa leggiamo</Heading>
            <p className="mt-4 text-body text-ink-soft">
              Solo email da{' '}
              <span className="font-semibold text-ink">automated@airbnb.com</span>{' '}
              e{' '}
              <span className="font-semibold text-ink">noreply@booking.com</span>.
              Niente altro. Le altre email nella tua casella — tua figlia, il
              commercialista, la newsletter del supermercato — non le vediamo e
              non le vogliamo.
            </p>
          </section>

          <section className="mt-10">
            <Heading level={2}>Cosa non possiamo fare</Heading>
            <p className="mt-4 text-body text-ink-soft">
              Non possiamo scrivere email al posto tuo. Non possiamo cancellare
              o modificare niente. Non possiamo condividere i tuoi dati con
              nessuno — né venderli, né analizzarli per fare pubblicità.
            </p>
          </section>

          <section className="mt-10">
            <Heading level={2}>Come te ne accorgi</Heading>
            <p className="mt-4 text-body text-ink-soft">
              Nella tua dashboard Premura vedi sempre esattamente quali email
              abbiamo letto. Se un giorno vedi lì una mail dal tuo
              commercialista, hai la prova che abbiamo sbagliato e puoi
              revocare l&apos;accesso in un click.
            </p>
          </section>

          <section className="mt-10">
            <Heading level={2}>Cosa ti mostrerà Google tra un secondo</Heading>
            <p className="mt-4 text-body text-ink-soft">
              Google dirà: &ldquo;Premura vuole leggere i tuoi messaggi
              Gmail&rdquo;. Non può dire &ldquo;solo quelli di Airbnb e
              Booking&rdquo; — è una limitazione tecnica di Google, non una
              nostra scelta. Ma il nostro codice filtra immediatamente: solo
              Airbnb e Booking arrivano a Premura. Il resto non esce mai da
              Google.
            </p>
          </section>

          <div className="mt-12 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
            <Button as="a" href="/" variant="ghost" size="lg">
              Non ora
            </Button>
            <Button as="a" href={startHref} variant="primary" size="lg">
              Ho capito, collega Gmail
            </Button>
          </div>

          {!DEV_HOST_ID ? (
            <Card padding="tight" className="mt-8 border-terracotta-soft">
              <p className="text-body-sm text-terracotta-2">
                <strong>Setup incompleto</strong>: <code>DEV_HOST_ID</code> non
                configurato in <code>.env.local</code>. Il bottone primary
                restituirà 400 finché non imposti l&apos;UUID dell&apos;host di
                test.
              </p>
            </Card>
          ) : null}
        </div>
      </Container>
    </main>
  );
}
