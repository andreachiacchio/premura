import { Container } from "@/components/Container";
import { Eyebrow } from "@/components/Eyebrow";
import { Heading } from "@/components/Heading";
import { WaitlistForm } from "@/components/landing/WaitlistForm";

export function Hero() {
  return (
    <section className="pt-14 pb-20 md:pt-24 md:pb-32">
      <Container>
        <Eyebrow>Premura · per host indipendenti</Eyebrow>

        <Heading level={1} soft={50} className="mt-6 max-w-4xl">
          Il concierge{" "}
          <span className="hidden md:inline">
            <br />
          </span>
          che{" "}
          <em
            className="not-italic text-terracotta"
            style={{ fontVariationSettings: '"SOFT" 100' }}
          >
            non dorme mai.
          </em>
        </Heading>

        <p className="mt-8 max-w-2xl text-body-lg text-ink-soft">
          Per host che vogliono recensioni da 10 senza rinunciare al proprio
          tempo. Premura studia ogni ospite, scrive messaggi su misura, prepara
          un pensiero in casa e intercetta i problemi prima che diventino
          recensioni.
        </p>

        <div className="mt-10 max-w-xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-gold-soft px-3 py-1 text-body-sm font-semibold text-ink">
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-gold-deep" />
            30 giorni gratis al lancio · senza carta
          </div>
          <WaitlistForm placement="hero" />
        </div>
      </Container>
    </section>
  );
}

export default Hero;
