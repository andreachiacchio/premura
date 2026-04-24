import Link from "next/link";
import { Container } from "@/components/Container";
import { Eyebrow } from "@/components/Eyebrow";
import { Heading } from "@/components/Heading";

export const metadata = {
  title: "Privacy — Premura",
  description:
    "Come Premura tratta i tuoi dati. Niente tracking, niente vendita, niente rumore.",
};

// TODO: sostituire "andrea@premura.it" con l'indirizzo definitivo quando il
// dominio email è attivo (al momento è un placeholder onesto — la casella
// non esiste ancora). Aggiornare anche il <a href="mailto:..."> sotto.
const CONTACT_EMAIL = "andrea@premura.it";

export default function PrivacyPage() {
  return (
    <>
      <main className="py-20 md:py-28">
        <Container variant="tight">
          <Eyebrow>Premura · privacy</Eyebrow>

          <Heading level={1} soft={50} className="mt-6">
            Come trattiamo i tuoi dati.
          </Heading>

          <p className="mt-6 text-body-sm text-ink-mute">
            Aggiornata il 24 aprile 2026
          </p>

          <section className="mt-12 md:mt-16">
            <Heading level={2}>
              Cosa raccogliamo quando ti iscrivi alla waitlist
            </Heading>
            <p className="mt-4 max-w-2xl text-body text-ink-soft">
              Email, nome (se lo lasci), numero di strutture che gestisci, data
              di iscrizione e canale di provenienza. Nient&apos;altro. Nessun
              tracking invasivo, nessun cookie di profilazione.
            </p>
          </section>

          <section className="mt-12 md:mt-16">
            <Heading level={2}>
              Perché raccogliamo questi dati
            </Heading>
            <p className="mt-4 max-w-2xl text-body text-ink-soft">
              Per un solo motivo: sapere quanti host ci aspettano, capire chi
              sono, avvertirli quando Premura apre in beta. Nessun altro uso.
              Nessuna vendita a terzi. Nessuna condivisione con partner
              pubblicitari.
            </p>
          </section>

          <section className="mt-12 md:mt-16">
            <Heading level={2}>
              Dove sono conservati
            </Heading>
            <p className="mt-4 max-w-2xl text-body text-ink-soft">
              Server Supabase in Europa (Frankfurt). Nessun trasferimento fuori
              UE. Crittografati in transito e a riposo.
            </p>
          </section>

          <section className="mt-12 md:mt-16">
            <Heading level={2}>
              Come cancellare i tuoi dati
            </Heading>
            <p className="mt-4 max-w-2xl text-body text-ink-soft">
              Scrivi a{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=Cancellami`}
                className="font-semibold text-ink underline underline-offset-2 decoration-line hover:decoration-ink"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              con oggetto &ldquo;Cancellami&rdquo;. Cancello entro 48 ore,
              senza fare domande. È il diritto più semplice che abbiamo.
            </p>
          </section>

          <section className="mt-12 md:mt-16">
            <Heading level={2}>
              Domande?
            </Heading>
            <p className="mt-4 max-w-2xl text-body text-ink-soft">
              Stesso indirizzo:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-semibold text-ink underline underline-offset-2 decoration-line hover:decoration-ink"
              >
                {CONTACT_EMAIL}
              </a>
              . Rispondo personalmente, non ci sono ticket.
            </p>
          </section>

          <div className="mt-20 pt-10 border-t border-line-soft">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-body-sm font-semibold text-ink-soft hover:text-ink transition-colors"
            >
              <span aria-hidden="true">←</span>
              Torna alla homepage
            </Link>
          </div>
        </Container>
      </main>
    </>
  );
}
