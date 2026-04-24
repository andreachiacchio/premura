import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { Eyebrow } from '@/components/Eyebrow';
import { Heading } from '@/components/Heading';

export const metadata = {
  title: 'Collegamento Gmail interrotto — Premura',
  description: 'Qualcosa è andato storto nel collegamento con Gmail. Niente di grave, basta riprovare.',
};

type Reason = 'state_invalid' | 'exchange_failed' | 'user_denied';

type SearchParams = { reason?: string };

type ErrorCopy = {
  heading: string;
  body: string; // può contenere paragrafi separati da \n\n
};

const COPY: Record<Reason, ErrorCopy> = {
  state_invalid: {
    heading: 'Qualcosa è andato storto',
    body: 'Il link di autorizzazione è scaduto o non è valido. Capita: basta riprovare.',
  },
  exchange_failed: {
    heading: 'Google non ha risposto bene',
    body: "C'è stato un problema durante il collegamento con Google. Non abbiamo ricevuto nulla di tuo, quindi non c'è niente da pulire — basta riprovare.\n\nSe succede di nuovo, scrivici a andreachiacchio1992@gmail.com.",
  },
  user_denied: {
    heading: 'Collegamento annullato',
    body: 'Va bene, non hai collegato Gmail. Senza accesso alle email di Airbnb e Booking, Premura non può preparare i messaggi per i tuoi ospiti. Quando sei pronta, torna qui.',
  },
};

function normalizeReason(raw: string | undefined): Reason {
  if (raw === 'state_invalid' || raw === 'exchange_failed' || raw === 'user_denied') {
    return raw;
  }
  // Fallback prudente: trattiamo come state_invalid (il default più benigno
  // per l'utente — "il link è scaduto, riprova").
  return 'state_invalid';
}

export default async function ConnectGmailErrorPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const reason = normalizeReason(params.reason);
  const copy = COPY[reason];
  const paragraphs = copy.body.split('\n\n');

  return (
    <main className="py-16 md:py-24 min-h-dvh">
      <Container>
        <div className="max-w-lg mx-auto">
          <Eyebrow variant="terracotta">Premura · Gmail</Eyebrow>

          <Heading level={1} soft={50} className="mt-6">
            {copy.heading}
          </Heading>

          <div className="mt-6 space-y-4 text-body-lg text-ink-soft">
            {paragraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>

          <div className="mt-12 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
            <Button as="a" href="/" variant="ghost" size="lg">
              Torna alla home →
            </Button>
            <Button as="a" href="/connect-gmail" variant="primary" size="lg">
              Riprova il collegamento →
            </Button>
          </div>
        </div>
      </Container>
    </main>
  );
}
