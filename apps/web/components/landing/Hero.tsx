import { Container } from '@/components/Container';
import { GoogleCtaButton } from '@/components/landing/GoogleCtaButton';
import { Eyebrow } from '@/components/Eyebrow';
import { Heading } from '@/components/Heading';
import Link from 'next/link';

// Riscrittura 04/08 v2 (brief "missione"): hero = missione in una riga,
// meta' destra occupata dalla conversazione statica (ospite di notte ->
// risposta pronta -> host approva).
// A6 (05/08): "Continua con Google" e' collegato al flusso OAuth reale
// (/auth/google -> consent -> /auth/callback -> host creato) ora che la
// registrazione e' mergiata e testata.
// Niente numeri di posti: nessuna scarsita' artificiale.

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
    <section className="pt-12 pb-12 md:pt-24 md:pb-24">
      <Container>
        <div className="grid gap-8 lg:gap-12 lg:grid-cols-2 lg:items-center">
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
              <GoogleCtaButton href="/auth/google" />
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
