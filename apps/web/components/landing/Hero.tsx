import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { Eyebrow } from '@/components/Eyebrow';
import { Heading } from '@/components/Heading';
import Link from 'next/link';

// Riscrittura 04/08 v2 (brief "missione"): hero = missione in una riga,
// meta' destra occupata dalla conversazione statica (ospite di notte ->
// risposta pronta -> host approva). CTA primario "Continua con Google":
// il flusso di registrazione non esiste ancora (punto 2), quindi il
// bottone porta al form beta (#beta-access) — NON cambiarlo in un link
// OAuth finche' la registrazione non e' chiusa, altrimenti il secondo
// host che si registra finisce contro un muro.
// Niente numeri di posti: nessuna scarsita' artificiale.

const GoogleG = (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

function ConversationDemo() {
  return (
    <div
      aria-hidden="true"
      className="rounded-[24px] border border-line bg-paper p-5 shadow-md md:p-6"
    >
      <div className="flex items-center gap-2 border-b border-line-soft pb-4">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-terracotta" />
        <p className="text-body-sm font-semibold text-ink">La Goccia di San Gennaro</p>
        <p className="ml-auto text-body-sm text-ink-mute">WhatsApp</p>
      </div>

      <p className="mt-4 text-eyebrow font-semibold uppercase text-ink-mute">
        23:47 · l’ospite scrive
      </p>
      <div className="mt-2 max-w-[85%] rounded-[16px] rounded-tl-[4px] bg-ivory-warm px-4 py-3">
        <p className="text-body text-ink">
          A che ora possiamo entrare domani? E c’è un parcheggio vicino?
        </p>
      </div>

      <p className="mt-5 text-eyebrow font-semibold uppercase text-ink-mute">
        23:48 · la risposta è già pronta
      </p>
      <div className="ml-auto mt-2 max-w-[85%] rounded-[16px] rounded-tr-[4px] border border-terracotta-soft bg-paper-deep px-4 py-3">
        <p className="text-body-sm text-ink-mute">
          Ciao! Ti risponde l’assistente automatico de La Goccia di San Gennaro.
        </p>
        <p className="mt-1.5 text-body text-ink">
          Benvenuti! Potete entrare dalle 15:00 — codici e parcheggio sono nella guida della casa,
          ve la lascio qui sotto. A domani! 🌿
        </p>
      </div>

      <p className="mt-5 text-eyebrow font-semibold uppercase text-ink-mute">
        07:42 · tu approvi col caffè in mano
      </p>
      <div className="mt-2 flex items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-ok px-3 py-1 text-body-sm font-semibold text-paper">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 6.5 4.5 9 10 3.5" />
          </svg>
          Approvata e inviata
        </span>
        <p className="text-body-sm text-ink-mute">Un tocco. Niente parte senza di te.</p>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="pt-14 pb-20 md:pt-24 md:pb-32">
      <Container>
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <Eyebrow>Premura · una categoria che non esisteva</Eyebrow>

            <Heading level={1} soft={50} className="mt-6">
              Un host AI accanto a ogni ospite,{' '}
              <em
                className="not-italic text-terracotta"
                style={{ fontVariationSettings: '"SOFT" 100' }}
              >
                per tutto il soggiorno.
              </em>
            </Heading>

            <p className="mt-8 max-w-2xl text-body-lg text-ink-soft">
              Ascolta, capisce, agisce — anche alle due di notte. Tu intervieni solo quando c’è
              una decisione di soldi. Non finge di essere te: l’ospite sa che è
              l’assistente della casa, e scrive lo stesso, perché ottiene risposta subito.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button as="a" href="#beta-access" variant="accent" size="lg" leftIcon={GoogleG}>
                Continua con Google
              </Button>
              <Link
                href="/login"
                className="text-body-sm text-ink-soft underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
              >
                Sei già host Premura? Accedi
              </Link>
            </div>
          </div>

          <ConversationDemo />
        </div>
      </Container>
    </section>
  );
}

export default Hero;
