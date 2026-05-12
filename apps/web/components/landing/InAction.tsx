import { Container } from '@/components/Container';
import { Eyebrow } from '@/components/Eyebrow';
import { Heading } from '@/components/Heading';
import Image from 'next/image';

// Slice I — Sezione "Premura in azione": 3 screenshot placeholder SVG.
// Andrea sostituira' con screenshot reali quando li avra'.

type Shot = {
  src: string;
  alt: string;
  caption: string;
};

const SHOTS: Shot[] = [
  {
    src: '/landing/prossimi-checkin.svg',
    alt: 'Dashboard host con la lista delle prossime prenotazioni',
    caption: 'Le prossime prenotazioni — tutto quello che ti serve sapere oggi.',
  },
  {
    src: '/landing/proposta-kit.svg',
    alt: 'Schermata con la proposta di kit personalizzato per un ospite',
    caption: "Una proposta di kit — pensata per l'ospite specifico, mai uguale.",
  },
  {
    src: '/landing/welcome-message.svg',
    alt: 'Anteprima del messaggio WhatsApp che parte la mattina del check-in',
    caption: 'Il messaggio che parte la mattina del check-in, firmato col tuo nome.',
  },
];

export function InAction() {
  return (
    <section className="py-20 md:py-28 bg-paper-deep">
      <Container>
        <Eyebrow>Dal vivo</Eyebrow>
        <Heading level={2} className="mt-3 max-w-2xl">
          Premura in azione.
        </Heading>
        <p className="mt-6 max-w-2xl text-body-lg text-ink-soft">
          Cosa vede un host che usa Premura ogni giorno.
        </p>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {SHOTS.map((shot) => (
            <figure key={shot.src} className="flex flex-col gap-4">
              <div className="overflow-hidden rounded-card border border-line bg-paper shadow-sm">
                <Image
                  src={shot.src}
                  alt={shot.alt}
                  width={800}
                  height={500}
                  className="w-full h-auto"
                  unoptimized
                />
              </div>
              <figcaption className="text-body-sm text-ink-soft leading-relaxed">
                {shot.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </Container>
    </section>
  );
}

export default InAction;
