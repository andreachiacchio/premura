import { Card } from '@/components/Card';
import { Container } from '@/components/Container';
import { Eyebrow } from '@/components/Eyebrow';
import { Heading } from '@/components/Heading';

// Brief "missione" 04/08, punto 3: i quattro livelli di iniziativa
// e le soglie di spesa, dette esplicitamente.

const LEVELS = [
  {
    n: '01',
    title: 'Prevenzione',
    body: 'Anticipa dai dati della struttura: se il riscaldamento parte alle 18, l’ospite lo sa prima di chiederlo.',
  },
  {
    n: '02',
    title: 'Risoluzione silenziosa',
    body: 'Informazioni, consigli, piccole richieste: risolve da solo e non ti disturba.',
  },
  {
    n: '03',
    title: 'Escalation controllata',
    body: 'Se c’è un rischio recensione, ti notifica con due o tre opzioni concrete. Scegli con un tocco.',
  },
  {
    n: '04',
    title: 'Escalation totale',
    body: 'Conflitti, rimborsi, questioni legali: si ferma e passa tutto a te, con il contesto già pronto.',
  },
];

const THRESHOLDS = [
  {
    range: 'sotto 10 €',
    rule: 'Agisce e ti informa.',
  },
  {
    range: '10–30 €',
    rule: 'Ti avvisa. Se non rispondi entro 15 minuti, procede.',
  },
  {
    range: 'sopra 30 €',
    rule: 'Non si muove senza il tuo sì.',
  },
];

export function HowItDecides() {
  return (
    <section className="py-20 md:py-28">
      <Container>
        <Eyebrow>Come decide</Eyebrow>
        <Heading level={2} className="mt-3 max-w-2xl">
          Autonomo sulle piccole cose. Fermo sulle grandi.
        </Heading>
        <p className="mt-6 max-w-2xl text-body-lg text-ink-soft">
          Quattro livelli di iniziativa, dal silenzio operoso al passaggio totale a te.
        </p>

        <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LEVELS.map((level) => (
            <li key={level.n}>
              <Card padding="loose" className="h-full">
                <span
                  aria-hidden="true"
                  className="font-serif text-h2 leading-none text-terracotta"
                  style={{ fontVariationSettings: '"SOFT" 100' }}
                >
                  {level.n}
                </span>
                <h3 className="mt-4 font-serif text-h3 text-ink">{level.title}</h3>
                <p className="mt-3 text-body text-ink-soft leading-relaxed">{level.body}</p>
              </Card>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-[16px] border border-line bg-paper p-6 md:p-8">
          <p className="text-eyebrow font-semibold uppercase text-ink-mute">
            Le soglie di spesa, nero su bianco
          </p>
          <ul className="mt-5 grid gap-6 md:grid-cols-3">
            {THRESHOLDS.map((t) => (
              <li key={t.range} className="border-t border-line-soft pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-6 first:border-t-0 first:pt-0 md:first:border-l-0 md:first:pl-0">
                <p
                  className="font-serif text-h3 text-ink tabular-nums"
                  style={{ fontVariationSettings: '"SOFT" 50' }}
                >
                  {t.range}
                </p>
                <p className="mt-2 text-body text-ink-soft">{t.rule}</p>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

export default HowItDecides;
