import { Container } from "@/components/Container";
import { Eyebrow } from "@/components/Eyebrow";
import { Heading } from "@/components/Heading";
import { WaitlistForm } from "@/components/landing/WaitlistForm";

export function WaitlistCTA() {
  return (
    <section className="py-20 md:py-28 bg-paper-deep">
      <Container variant="tight">
        <Eyebrow variant="terracotta">Pre-lancio</Eyebrow>

        <Heading level={2} soft={50} className="mt-3">
          Il lancio è dietro l&apos;angolo.{" "}
          <em
            className="not-italic text-terracotta"
            style={{ fontVariationSettings: '"SOFT" 100' }}
          >
            Vuoi essere tra i primi?
          </em>
        </Heading>

        <p className="mt-6 text-body-lg text-ink-soft">
          Apriamo nei prossimi mesi in beta privata a 30–50 host. Se vuoi
          esserci, lascia la tua email. Ti scrivo quando è il momento — senza
          rumore.
        </p>

        <div className="mt-10">
          <WaitlistForm placement="cta" />
        </div>
      </Container>
    </section>
  );
}

export default WaitlistCTA;
