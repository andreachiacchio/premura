import { Container } from '@/components/Container';
import { Heading } from '@/components/Heading';
import { BetaRequestForm } from '@/components/landing/BetaRequestForm';
import { GoogleCtaButton } from '@/components/landing/GoogleCtaButton';

// Correzioni post-review 04/08 (punto 1): la pagina promette UNA cosa —
// entri da solo. Niente "beta privata in corso", niente "accesso su
// richiesta", niente limiti di strutture. Il CTA principale e' lo
// stesso "Continua con Google" dell'hero — A6 (05/08): collegato al
// flusso OAuth reale; il modulo resta ma declassato a secondario.

export function BetaAccessCTA() {
  return (
    <section id="beta-access" className="py-12 md:py-24 bg-paper-deep scroll-mt-16">
      <Container variant="tight">
        <Heading level={2} soft={50} className="mt-3">
          Premura accoglie i suoi primi host{' '}
          <em
            className="not-italic text-terracotta"
            style={{ fontVariationSettings: '"SOFT" 100' }}
          >
            adesso.
          </em>
        </Heading>

        <p className="mt-6 text-body-lg text-ink-soft">
          Entri da solo, quando vuoi. Bastano due minuti.
        </p>

        <div className="mt-8">
          <GoogleCtaButton href="/auth/google" />
        </div>

        <div id="beta-form" className="mt-14 border-t border-line-soft pt-10 scroll-mt-16">
          <p className="text-body-lg text-ink-soft">
            Preferisci scrivermi prima? Rispondo io, entro 24h.
          </p>
          <div className="mt-8">
            <BetaRequestForm />
          </div>
        </div>
      </Container>
    </section>
  );
}

export default BetaAccessCTA;
