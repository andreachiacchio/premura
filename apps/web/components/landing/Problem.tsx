import { Container } from "@/components/Container";
import { Eyebrow } from "@/components/Eyebrow";
import { Heading } from "@/components/Heading";

const MOMENTS = [
  "L'ospite scrive alle 23:40 per il codice del WiFi. Tu dormi, o dovresti.",
  "Scrivi sempre lo stesso messaggio di benvenuto. Ogni volta senti che non è più tuo.",
  "Un 8 su Booking ti costa due settimane di ranking. E non capisci neanche cosa sia andato storto.",
];

export function Problem() {
  return (
    <section className="py-12 md:py-24">
      <Container variant="tight">
        <Eyebrow>Il problema</Eyebrow>
        <Heading level={2} className="mt-3">
          Sei diventato host.{" "}
          <em
            className="not-italic text-terracotta"
            style={{ fontVariationSettings: '"SOFT" 100' }}
          >
            Non dovevi diventare call center.
          </em>
        </Heading>

        <ul className="mt-10 space-y-6">
          {MOMENTS.map((line, i) => (
            <li key={i} className="flex gap-5 border-t border-line-soft pt-6 first:border-t-0 first:pt-0">
              <span
                aria-hidden="true"
                className="font-serif text-h3 text-ink-mute leading-none shrink-0 w-10 tabular-nums"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-body-lg text-ink leading-relaxed">{line}</p>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-body-lg text-ink-soft">
          Premura prepara le risposte al posto tuo, firmate col nome della tua
          struttura. E lo dice chiaramente: l&apos;ospite sa che a scrivere è un
          assistente AI. La differenza la fa la cura, non il trucco.
        </p>
      </Container>
    </section>
  );
}

export default Problem;
