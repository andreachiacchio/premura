import { Card } from '@/components/Card';
import { Container } from '@/components/Container';
import { Eyebrow } from '@/components/Eyebrow';
import { Heading } from '@/components/Heading';
import { cn } from '@/lib/cn';

type Tier = {
  price: string;
  unit: string;
  label: string;
  highlighted?: boolean;
  badge?: string;
};

const TIERS: Tier[] = [
  { price: '9,99', unit: '€ / mese', label: '1 struttura' },
  {
    price: '7,99',
    unit: '€ / mese',
    label: '2–5 strutture',
    highlighted: true,
    badge: 'Più scelto',
  },
  { price: '5,99', unit: '€ / mese', label: '6+ strutture' },
];

export function Pricing() {
  return (
    <section className="py-12 md:py-16">
      <Container>
        <Eyebrow>Prezzi</Eyebrow>
        <Heading level={2} className="mt-3 max-w-2xl">
          Trasparente, come un host dovrebbe essere.
        </Heading>
        <p className="mt-5 max-w-2xl text-body-lg text-ink-soft">
          Paghi una sottoscrizione mensile per struttura. Nessun costo di setup, nessun contratto
          annuale.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => (
            <Card
              key={tier.label}
              padding="loose"
              className={cn(
                'relative h-full',
                tier.highlighted && 'border-terracotta-soft bg-paper-deep',
              )}
            >
              {tier.badge ? (
                <span className="absolute -top-3 left-6 inline-flex items-center gap-2 rounded-full bg-terracotta px-3 py-1 text-body-sm font-semibold text-paper">
                  <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-paper/80" />
                  {tier.badge}
                </span>
              ) : null}

              <p className="text-body-sm font-semibold uppercase tracking-wider text-ink-mute">
                {tier.label}
              </p>

              <div className="mt-5 flex items-baseline gap-2">
                <span
                  className="font-serif text-h1 text-ink leading-none tabular-nums"
                  style={{ fontVariationSettings: '"SOFT" 50' }}
                >
                  {tier.price}
                </span>
                <span className="text-body text-ink-soft">{tier.unit}</span>
              </div>

              <p className="mt-5 text-body-sm text-ink-soft">
                Fatturato mensile. Cambi tier quando aggiungi o togli una struttura.
              </p>
            </Card>
          ))}
        </div>

        <Card padding="loose" className="mt-6 border-terracotta-soft">
          <Eyebrow variant="terracotta">Zero markup sul kit</Eyebrow>
          <p className="mt-3 text-body-lg text-ink leading-relaxed">
            Il kit fisico è al costo vivo <span className="whitespace-nowrap">+ €0,75</span> di
            servizio
            <span className="whitespace-nowrap"> + €2</span> per la cleaner
            <span className="whitespace-nowrap"> + €1</span> di biglietto. Zero margine per noi. Non
            è una promo: è un pilastro.
          </p>
        </Card>

        <p className="mt-8 text-body text-ink-mute">
          30 giorni gratis al lancio, senza carta. Cancelli quando vuoi.
        </p>
      </Container>
    </section>
  );
}

export default Pricing;
