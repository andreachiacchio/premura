import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Container } from '@/components/Container';
import { Eyebrow } from '@/components/Eyebrow';
import { Heading } from '@/components/Heading';

export const metadata = {
  title: 'Gmail collegato — Premura',
  description: 'Gmail collegato a Premura. Da adesso leggeremo automaticamente le prenotazioni Airbnb e Booking.',
};

type SearchParams = {
  email?: string;
  connectedAt?: string;
};

// Next.js 15: searchParams è Promise.
export default async function ConnectGmailSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const email = params.email ?? '';
  const connectedAt = parseDate(params.connectedAt);

  const formattedDate = connectedAt
    ? new Intl.DateTimeFormat('it-IT', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Rome',
      }).format(connectedAt)
    : '—';

  return (
    <main className="py-16 md:py-24 min-h-dvh">
      <Container>
        <div className="max-w-lg mx-auto">
          <Eyebrow variant="terracotta">Premura · Gmail</Eyebrow>

          <Heading level={1} soft={50} className="mt-6">
            Gmail{' '}
            <em
              className="not-italic text-terracotta"
              style={{ fontVariationSettings: '"SOFT" 100' }}
            >
              collegato
            </em>
          </Heading>

          <p className="mt-6 text-body-lg text-ink-soft">
            Ora Premura ha accesso alle email di Airbnb e Booking.
          </p>

          <Card padding="loose" className="mt-10">
            <Eyebrow>Dettagli collegamento</Eyebrow>
            <dl className="mt-4 space-y-3 text-body">
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <dt className="text-ink-mute sm:w-40 shrink-0">Account connesso</dt>
                <dd className="font-semibold text-ink break-all">
                  {email || '—'}
                </dd>
              </div>
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <dt className="text-ink-mute sm:w-40 shrink-0">Connesso il</dt>
                <dd className="font-semibold text-ink">{formattedDate}</dd>
              </div>
            </dl>
          </Card>

          <p className="mt-10 text-body text-ink-soft">
            Da adesso in poi ogni prenotazione verrà rilevata automaticamente.
            Quando un ospite prenota La Goccia, leggeremo la mail da Airbnb o
            Booking, studieremo il profilo e ti aggiorneremo nella dashboard.
          </p>

          <div className="mt-12">
            <Button as="a" href="/dashboard" variant="primary" size="lg">
              Torna alla dashboard →
            </Button>
          </div>
        </div>
      </Container>
    </main>
  );
}

function parseDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
