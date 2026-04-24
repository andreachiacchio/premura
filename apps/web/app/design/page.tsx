import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Container } from "@/components/Container";
import { Eyebrow } from "@/components/Eyebrow";
import { Heading } from "@/components/Heading";

export const metadata = {
  title: "Design system — Premura",
  description: "Living style guide dei componenti base di Premura.",
};

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-20 first:mt-12">
      <Eyebrow variant="terracotta">{eyebrow}</Eyebrow>
      <Heading level={2} className="mt-3">
        {title}
      </Heading>
      <div className="mt-8 space-y-10">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Eyebrow className="mb-4">{label}</Eyebrow>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </div>
  );
}

const ArrowRight = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 7h10M8 3l4 4-4 4" />
  </svg>
);

const ArrowLeft = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 7H2M6 3 2 7l4 4" />
  </svg>
);

export default function DesignPage() {
  return (
    <main className="py-12 md:py-20">
      <Container>
        {/* ─── Intro ─────────────────────────────────────────── */}
        <Eyebrow variant="terracotta">Premura · Living style guide</Eyebrow>
        <Heading level={1} soft={50} className="mt-4">
          Design{" "}
          <em
            className="not-italic text-terracotta"
            style={{ fontVariationSettings: '"SOFT" 100' }}
          >
            system
          </em>
          .
        </Heading>
        <p className="mt-6 max-w-2xl text-body-lg text-ink-soft">
          Componenti fondamentali riutilizzabili per tutto{" "}
          <code className="font-mono text-body-sm text-ink">apps/web</code>.
          Milestone 1.3.b della roadmap.
        </p>

        {/* ─── Button ───────────────────────────────────────── */}
        <Section eyebrow="Component" title="Button">
          <Row label="Variants · size md">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="accent">Entra nella waitlist</Button>
            <Button variant="ghost">Ghost</Button>
          </Row>

          <Row label="Sizes · primary">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </Row>

          <Row label="Sizes · secondary">
            <Button variant="secondary" size="sm">
              Small
            </Button>
            <Button variant="secondary" size="md">
              Medium
            </Button>
            <Button variant="secondary" size="lg">
              Large
            </Button>
          </Row>

          <Row label="With icons">
            <Button leftIcon={ArrowLeft}>Indietro</Button>
            <Button variant="accent" rightIcon={ArrowRight}>
              Continua
            </Button>
            <Button variant="secondary" leftIcon={ArrowLeft} rightIcon={ArrowRight}>
              Entrambe
            </Button>
            <Button variant="ghost" rightIcon={ArrowRight}>
              Leggi di più
            </Button>
          </Row>

          <Row label="As link (as='a')">
            <Button as="a" href="#" variant="primary">
              Vai alla home
            </Button>
            <Button as="a" href="#" variant="accent" rightIcon={ArrowRight}>
              Apri prototipo
            </Button>
            <Button as="a" href="#" variant="ghost">
              Termini
            </Button>
          </Row>

          <Row label="Disabled">
            <Button disabled>Primary</Button>
            <Button variant="secondary" disabled>
              Secondary
            </Button>
            <Button variant="accent" disabled>
              Accent
            </Button>
            <Button variant="ghost" disabled>
              Ghost
            </Button>
          </Row>
        </Section>

        {/* ─── Container ────────────────────────────────────── */}
        <Section eyebrow="Component" title="Container">
          <div className="space-y-4">
            <Eyebrow>Default · max-w-7xl (1280px)</Eyebrow>
            <div className="bg-paper-deep border border-line rounded-[16px]">
              <Container className="py-6">
                <p className="text-body text-ink-soft">
                  Wrapper principale, pensato per pagine marketing o dashboard a
                  larghezza piena.
                </p>
              </Container>
            </div>
          </div>

          <div className="space-y-4">
            <Eyebrow>Tight · max-w-3xl (768px)</Eyebrow>
            <div className="bg-paper-deep border border-line rounded-[16px]">
              <Container variant="tight" className="py-6">
                <p className="text-body text-ink-soft">
                  Variante compatta per contenuti da lettura lunga (articoli,
                  form, onboarding chat).
                </p>
              </Container>
            </div>
          </div>
        </Section>

        {/* ─── Eyebrow ──────────────────────────────────────── */}
        <Section eyebrow="Component" title="Eyebrow">
          <Row label="Default · ink-mute">
            <Eyebrow>Fase 1 · Studio</Eyebrow>
          </Row>
          <Row label="Terracotta · accent">
            <Eyebrow variant="terracotta">Novità</Eyebrow>
          </Row>
        </Section>

        {/* ─── Heading ──────────────────────────────────────── */}
        <Section eyebrow="Component" title="Heading">
          <div className="space-y-6">
            <div>
              <Eyebrow className="mb-2">level=1 · font serif</Eyebrow>
              <Heading level={1}>Il concierge che non dorme mai.</Heading>
            </div>
            <div>
              <Eyebrow className="mb-2">level=1 · soft=50 (estetica prototipo)</Eyebrow>
              <Heading level={1} soft={50}>
                Il concierge che non dorme mai.
              </Heading>
            </div>
            <div>
              <Eyebrow className="mb-2">level=2</Eyebrow>
              <Heading level={2}>Cinque fasi, zero pensieri.</Heading>
            </div>
            <div>
              <Eyebrow className="mb-2">level=3</Eyebrow>
              <Heading level={3}>Cura, senza interrompere.</Heading>
            </div>
            <div>
              <Eyebrow className="mb-2">level=2, as=&quot;h1&quot; (override semantico)</Eyebrow>
              <Heading level={2} as="h1">
                Titolo visivamente h2 ma semanticamente h1.
              </Heading>
            </div>
          </div>
        </Section>

        {/* ─── Card ─────────────────────────────────────────── */}
        <Section eyebrow="Component" title="Card">
          <div>
            <Eyebrow className="mb-4">Padding variants</Eyebrow>
            <div className="grid gap-4 md:grid-cols-3">
              <Card padding="tight">
                <Eyebrow>Padding · tight (p-4)</Eyebrow>
                <Heading level={3} className="mt-2">
                  Guest DNA
                </Heading>
                <p className="mt-2 text-body-sm text-ink-soft">
                  Anna · 34 anni · Amsterdam.
                </p>
              </Card>
              <Card>
                <Eyebrow>Padding · default (p-6)</Eyebrow>
                <Heading level={3} className="mt-2">
                  Kit inviato
                </Heading>
                <p className="mt-2 text-body-sm text-ink-soft">
                  Budget €12 · tema &quot;colazione napoletana&quot;.
                </p>
              </Card>
              <Card padding="loose">
                <Eyebrow>Padding · loose (p-8)</Eyebrow>
                <Heading level={3} className="mt-2">
                  Recensione
                </Heading>
                <p className="mt-2 text-body-sm text-ink-soft">
                  9,5 / 10 — un salto rispetto alla baseline.
                </p>
              </Card>
            </div>
          </div>

          <div>
            <Eyebrow className="mb-4">Composizione con Button</Eyebrow>
            <Card padding="loose" className="max-w-md">
              <Eyebrow variant="terracotta">Azione richiesta</Eyebrow>
              <Heading level={3} className="mt-3">
                Klaus ha scritto.
              </Heading>
              <p className="mt-3 text-body text-ink-soft">
                Premura ha preparato una risposta. Serve la tua approvazione
                prima di inviarla all&apos;ospite.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button variant="primary" rightIcon={ArrowRight}>
                  Approva e invia
                </Button>
                <Button variant="ghost">Modifica</Button>
              </div>
            </Card>
          </div>
        </Section>

        {/* ─── Tokens reference ─────────────────────────────── */}
        <Section eyebrow="Reference" title="Palette · Design tokens">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {[
              ["ivory", "#F5EFE4"],
              ["paper", "#FDFAF3"],
              ["paper-deep", "#F8F1E1"],
              ["ink", "#1F3A4D"],
              ["ink-soft", "#4A5F72"],
              ["ink-mute", "#8A98A5"],
              ["terracotta", "#C65D3A"],
              ["terracotta-2", "#A84A2B"],
              ["gold", "#D4A574"],
              ["gold-deep", "#B38850"],
              ["line", "#E5DCC8"],
              ["ok", "#4E7A57"],
            ].map(([name, hex]) => (
              <Card key={name} padding="tight">
                <div
                  className="h-10 rounded-[10px] border border-line"
                  style={{ backgroundColor: hex }}
                />
                <p className="mt-3 font-mono text-body-sm text-ink">{name}</p>
                <p className="font-mono text-body-sm text-ink-mute">{hex}</p>
              </Card>
            ))}
          </div>
        </Section>
      </Container>
    </main>
  );
}
