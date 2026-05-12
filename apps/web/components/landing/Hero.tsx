import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { Eyebrow } from '@/components/Eyebrow';
import { Heading } from '@/components/Heading';
import Link from 'next/link';

// Slice I — Hero senza form inline. Doppia CTA:
//  1. "Richiedi accesso beta" → ancora #beta-access (sezione finale)
//  2. "Sei già host? Accedi" → /login

const ArrowDown = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M7 2v10M3 8l4 4 4-4" />
  </svg>
);

export function Hero() {
  return (
    <section className="pt-10 pb-12 md:pt-20 md:pb-16">
      <Container>
        <Eyebrow>Premura · per host indipendenti</Eyebrow>

        <Heading level={1} soft={50} className="mt-5 max-w-4xl">
          Il concierge{' '}
          <span className="hidden md:inline">
            <br />
          </span>
          che{' '}
          <em
            className="not-italic text-terracotta"
            style={{ fontVariationSettings: '"SOFT" 100' }}
          >
            non dorme mai.
          </em>
        </Heading>

        <p className="mt-6 max-w-2xl text-body-lg text-ink-soft">
          Per host che vogliono recensioni da 10 senza rinunciare al proprio tempo. Premura è un
          agente AI che studia ogni ospite, scrive messaggi su misura, prepara un pensiero in casa e
          intercetta i problemi prima che diventino recensioni.
        </p>

        <div className="mt-8 flex flex-col gap-4 max-w-xl">
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-gold-soft px-3 py-1 text-body-sm font-semibold text-ink">
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-gold-deep" />
            Beta privata in corso · 10 posti aperti
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <Button as="a" href="#beta-access" variant="accent" size="lg" rightIcon={ArrowDown}>
              Richiedi accesso beta
            </Button>
            <Link
              href="/login"
              className="text-body-sm text-ink-mute underline underline-offset-4 decoration-line hover:text-ink hover:decoration-ink transition-colors"
            >
              Sei già host Premura? Accedi
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}

export default Hero;
