import { Card } from '@/components/Card';
import { Container } from '@/components/Container';
import { Eyebrow } from '@/components/Eyebrow';
import { Heading } from '@/components/Heading';

// Brief "missione" 04/08, punto 6: sezione di fiducia. I tre "mai".
// Il secondo e' il ribaltamento del vincolo AI Act in argomento di
// vendita — verbatim dal brief.

const NEVERS = [
  {
    title: 'Mai i contatti dei fornitori all’ospite',
    body: 'La cleaner, lo skipper, il tecnico: coordina Premura. I loro numeri non escono mai verso l’ospite. Il tuo network resta tuo.',
  },
  {
    title: 'Mai fingere di essere te',
    body: 'L’ospite sa che è l’assistente della casa — e scrive lo stesso, perché ottiene risposta alle due di notte. Trasparenza in ogni messaggio, come chiede l’AI Act. Per noi non è un obbligo: è il prodotto.',
  },
  {
    title: 'Mai spendere oltre soglia senza di te',
    body: 'Le soglie sono regole, non suggerimenti. Sopra i 30 euro Premura si ferma e aspetta il tuo sì. Sempre.',
  },
];

export function NeverList() {
  return (
    <section className="py-20 md:py-28 bg-paper-deep">
      <Container>
        <Eyebrow>Fiducia</Eyebrow>
        <Heading level={2} className="mt-3 max-w-2xl">
          Cosa Premura{' '}
          <em className="not-italic text-terracotta" style={{ fontVariationSettings: '"SOFT" 100' }}>
            non fa mai.
          </em>
        </Heading>

        <ul className="mt-14 grid gap-4 md:grid-cols-3">
          {NEVERS.map((item) => (
            <li key={item.title}>
              <Card padding="loose" className="h-full">
                <h3 className="font-serif text-h3 text-ink">{item.title}</h3>
                <p className="mt-3 text-body text-ink-soft leading-relaxed">{item.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export default NeverList;
