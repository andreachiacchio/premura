import { Container } from '@/components/Container';
import { Eyebrow } from '@/components/Eyebrow';
import { Heading } from '@/components/Heading';
import { BetaRequestForm } from '@/components/landing/BetaRequestForm';

// Slice I — Sezione finale "Beta privata in corso".
// Sostituisce WaitlistCTA. Ancora #beta-access per il bottone hero.

export function BetaAccessCTA() {
  return (
    <section id="beta-access" className="py-20 md:py-28 bg-paper-deep scroll-mt-16">
      <Container variant="tight">
        <Eyebrow variant="terracotta">Beta privata in corso</Eyebrow>

        <Heading level={2} soft={50} className="mt-3">
          Premura accoglie i suoi primi host adesso.{' '}
          <em
            className="not-italic text-terracotta"
            style={{ fontVariationSettings: '"SOFT" 100' }}
          >
            10 posti, accesso su richiesta.
          </em>
        </Heading>

        <p className="mt-6 text-body-lg text-ink-soft">
          Stiamo affinando Premura con i primi host indipendenti italiani. Se gestisci 1-5 strutture
          e vuoi vedere come funziona, scrivi qui sotto. Ti rispondo io personalmente entro 24h.
        </p>

        <div className="mt-10">
          <BetaRequestForm />
        </div>
      </Container>
    </section>
  );
}

export default BetaAccessCTA;
