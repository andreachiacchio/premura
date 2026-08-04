import { Container } from '@/components/Container';
import { Eyebrow } from '@/components/Eyebrow';
import { Heading } from '@/components/Heading';

// Brief "missione" 04/08, punto 2: la scena che definisce il prodotto.
// Raccontata come storia col ritmo temporale, non come elenco feature.

const BEATS = [
  {
    time: '23:12',
    label: "l'ospite scrive",
    text: '«Non riesco a dormire, c’è troppo rumore.»',
    kind: 'guest' as const,
  },
  {
    time: '23:13',
    label: 'Premura legge, capisce, propone',
    text: '«Posso farti arrivare dei tappi in 30 minuti, 4 euro. Vuoi?»',
    kind: 'premura' as const,
  },
  {
    time: '23:14',
    label: "l'ospite dice sì",
    text: 'Premura ordina, manda il tracking, avvisa te.',
    kind: 'narration' as const,
  },
  {
    time: '23:16',
    label: 'tu apri l’app',
    text: 'La richiesta e l’azione già fatta, una cifra da approvare: 4 euro. Un tocco, e torni alla tua serata.',
    kind: 'narration' as const,
  },
  {
    time: '07:30',
    label: 'la mattina',
    text: 'Tappi consegnati, ospite riposato. La recensione a cinque stelle parte da qui.',
    kind: 'narration' as const,
  },
];

export function NightScene() {
  return (
    <section className="py-20 md:py-28 bg-paper-deep">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
          <div>
            <Eyebrow>Notte 1</Eyebrow>
            <Heading level={2} className="mt-3">
              «C&apos;è troppo{' '}
              <em
                className="not-italic text-terracotta"
                style={{ fontVariationSettings: '"SOFT" 100' }}
              >
                rumore.
              </em>
              »
            </Heading>
            <p className="mt-6 max-w-xl text-body-lg text-ink-soft">
              È questo il lavoro di Premura: stare accanto all&apos;ospite quando succede qualcosa,
              capire cosa serve, e muoversi. A te resta una sola cosa da fare — dire sì a 4 euro.
            </p>
            <p className="mt-4 text-body-lg font-semibold text-ink">
              Tu non hai mai aperto WhatsApp.
            </p>
          </div>

          <ol className="space-y-0">
            {BEATS.map((beat, i) => (
              <li key={beat.time} className="relative flex gap-5 pb-8 last:pb-0 md:gap-8">
                <div className="flex flex-col items-center">
                  <span
                    className="font-serif text-h4 leading-none text-terracotta tabular-nums"
                    style={{ fontVariationSettings: '"SOFT" 50' }}
                  >
                    {beat.time}
                  </span>
                  {i < BEATS.length - 1 ? (
                    <span aria-hidden="true" className="mt-2 w-px flex-1 bg-line" />
                  ) : null}
                </div>
                <div className="pb-2">
                  <p className="text-eyebrow font-semibold uppercase text-ink-mute">{beat.label}</p>
                  <p
                    className={
                      beat.kind === 'narration'
                        ? 'mt-1.5 max-w-lg text-body-lg text-ink-soft'
                        : 'mt-1.5 max-w-lg text-body-lg text-ink'
                    }
                  >
                    {beat.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}

export default NightScene;
