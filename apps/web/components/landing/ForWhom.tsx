import { Container } from '@/components/Container';
import { Eyebrow } from '@/components/Eyebrow';
import { Heading } from '@/components/Heading';

// Slice I — Sezione "Per chi è Premura": qualifica + dis-qualifica.
// Mantiene la voce italiana calda, niente marketing-speak.

const FIT: string[] = [
  'Sei un host indipendente: 1-5 strutture, niente PMS, niente azienda.',
  "Vuoi delegare l'accoglienza ma non sai a chi (e non vuoi pagare un'agenzia).",
  'Le tue recensioni vanno da 8 a 9. Vuoi arrivare a 9,5+ senza farti il fegato.',
];

const NOT_FIT: string[] = [
  'Cerchi un property management che gestisca anche pulizie, fiscalità, banking.',
  'Hai un hotel o una struttura ricettiva tradizionale (Premura è per affitti brevi).',
  'Vuoi mandare messaggi spam-automation a tutti gli ospiti uguali.',
];

const CheckIcon = (
  <svg
    width="22"
    height="22"
    viewBox="0 0 22 22"
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <circle cx="11" cy="11" r="11" fill="#E8D8C8" />
    <path
      d="M6.5 11.5l3 3 6-6.5"
      stroke="#C65D3A"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CrossIcon = (
  <svg
    width="22"
    height="22"
    viewBox="0 0 22 22"
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <circle cx="11" cy="11" r="11" fill="#E6E1DA" />
    <path d="M7.5 7.5l7 7M14.5 7.5l-7 7" stroke="#1F3A4D" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export function ForWhom() {
  return (
    <section className="py-12 md:py-16">
      <Container>
        <Eyebrow>Onestà prima di tutto</Eyebrow>
        <Heading level={2} className="mt-3 max-w-2xl">
          Premura è giusto per te se…
        </Heading>

        <ul className="mt-8 grid gap-5 md:grid-cols-3">
          {FIT.map((line) => (
            <li key={line} className="flex gap-4 rounded-card border border-line bg-paper p-5">
              {CheckIcon}
              <p className="text-body text-ink leading-relaxed">{line}</p>
            </li>
          ))}
        </ul>

        <Heading level={3} className="mt-10 max-w-2xl">
          Non è per te se…
        </Heading>

        <ul className="mt-6 grid gap-5 md:grid-cols-3">
          {NOT_FIT.map((line) => (
            <li
              key={line}
              className="flex gap-4 rounded-card border border-line-soft bg-paper-deep/40 p-5"
            >
              {CrossIcon}
              <p className="text-body text-ink-soft leading-relaxed">{line}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export default ForWhom;
