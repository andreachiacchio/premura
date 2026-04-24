import { Card } from "@/components/Card";
import { Container } from "@/components/Container";
import { Eyebrow } from "@/components/Eyebrow";
import { Heading } from "@/components/Heading";

type Phase = {
  num: string;
  title: string;
  body: string;
};

const PHASES: Phase[] = [
  {
    num: "01",
    title: "Studio",
    body: "Appena arriva la prenotazione, Premura analizza l'ospite. Nazionalità, recensioni che ha lasciato altrove, pattern. Ne esce un Guest DNA: archetipo, rischi previsti, tono giusto.",
  },
  {
    num: "02",
    title: "Contatto",
    body: "Due giorni prima del check-in, messaggio WhatsApp caldo nella lingua dell'ospite e nel tuo tono. Più un micro-quiz di 60 secondi — quattro swipe — per capire cosa gli farà piacere.",
  },
  {
    num: "03",
    title: "Cura",
    body: "Compone un kit personalizzato entro il budget che hai scelto (da €3 a €20 per struttura). Ordina su Amazon o dai partner locali, briefa la cleaner, ti manda la foto la mattina del check-in con un biglietto scritto a mano.",
  },
  {
    num: "04",
    title: "Presenza",
    body: "Giorno due del soggiorno: check-in emotivo. Se va tutto bene, silenzio. Se c'è un problema piccolo, lo risolve da solo. Se è grosso, ti avvisa — con la soluzione già pronta.",
  },
  {
    num: "05",
    title: "Chiusura",
    body: "Ventiquattr'ore dopo il check-out, sondaggio privato. Se l'ospite è contento, lo spinge gentilmente alla recensione pubblica. Se non lo è, cerca di recuperarlo prima che scriva.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 md:py-28 bg-paper-deep">
      <Container>
        <Eyebrow>Come funziona</Eyebrow>
        <Heading level={2} className="mt-3 max-w-2xl">
          Cinque fasi, zero pensieri.
        </Heading>
        <p className="mt-6 max-w-2xl text-body-lg text-ink-soft">
          Ogni prenotazione passa per cinque tappe. Tu imposti il budget
          all&apos;inizio e non tocchi più niente.
        </p>

        <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PHASES.map((phase) => (
            <li key={phase.num}>
              <Card padding="loose" className="h-full">
                <div className="flex items-baseline gap-4">
                  <span
                    className="font-serif text-h2 text-terracotta leading-none"
                    style={{ fontVariationSettings: '"SOFT" 100' }}
                    aria-hidden="true"
                  >
                    {phase.num}
                  </span>
                  <Heading level={3} className="leading-tight">
                    {phase.title}
                  </Heading>
                </div>
                <p className="mt-5 text-body text-ink-soft">{phase.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

export default HowItWorks;
