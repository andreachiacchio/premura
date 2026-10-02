import { GoogleCtaButton } from '@/components/landing/GoogleCtaButton';
import Link from 'next/link';

export function LiveLanding() {
  return (
    <div className="min-h-screen bg-[#07080c] text-[#f6f1ea]">
      <main className="mx-auto max-w-6xl px-5 pb-16 lg:px-10">
        <section className="grid items-start gap-8 pt-8 lg:grid-cols-2 lg:items-center lg:gap-12 lg:pt-16">
          <div>
            <p className="text-eyebrow font-semibold uppercase text-[#b7aea4]">Premura</p>
            <h1 className="mt-3 font-serif text-[40px] leading-[0.95] tracking-[-0.03em] sm:text-[64px]">
              Accanto a ogni ospite.
            </h1>
            <p className="mt-4 max-w-md text-body-lg text-[#b7aea4]">
              Per tutto il soggiorno. Anche alle due di notte. Tu dici sì solo se ci sono dei soldi.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <GoogleCtaButton href="/auth/google" />
              <Link href="/login" className="text-body-sm text-[#b7aea4] underline underline-offset-4">
                Sei già host Premura? Accedi
              </Link>
            </div>
          </div>
          <Night />
        </section>

        <section className="mt-10 border-t border-white/10 pt-6 lg:mt-16">
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
            <Block kicker="Chi siamo" title="L’assistente della casa.">
              Non un gestionale e non un call center. Premura sta con l’ospite quando tu non ci sei. Si presenta.
              Non finge di essere te.
            </Block>
            <Block kicker="Cosa vogliamo" title="Che tu non apra WhatsApp.">
              L’ospite scrive. Premura capisce e agisce. Sotto una cifra piccola va avanti e ti avvisa. Sopra, si
              ferma e aspetta il tuo sì.
            </Block>
          </div>
        </section>

        <section className="mt-8 border-t border-white/10 pt-6">
          <Block kicker="I servizi" title="Una cosa da offrire. Il prezzo è già scritto.">
            In costiera può essere il gozzo, il transfer o il cuoco. A Napoli il gozzo non c’è. L’ospite vede
            un’offerta sola, con il prezzo. Il fornitore non si nomina. Su ogni sì, Premura tiene il quindici per
            cento, già dentro quella cifra.
          </Block>
        </section>

        <section className="mt-8 border-t border-white/10 pt-6">
          <p className="text-eyebrow font-semibold uppercase text-[#e07a4c]">Prezzi</p>
          <h2 className="mt-2 max-w-xl font-serif text-[28px] leading-tight">
            Trasparente, come un host dovrebbe essere.
          </h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Price name="1 casa" amount="9,99 €" note="al mese" />
            <Price name="2–5 case" amount="14,99 €" note="al mese, per casa" featured />
            <Price name="6 o più" amount="19,99 €" note="al mese, per casa" />
          </div>
          <p className="mt-3 max-w-xl text-body-sm text-[#8a8178]">
            Più case, più lavoro, cifra più alta. Gratis fino al check-out del primo ospite. Nessuna carta. Il
            kit, quando ci sarà, resta al costo. Il margine è sulla commissione, non sul kit.
          </p>
        </section>

        <section className="mt-10 border-t border-white/10 pt-8 text-center">
          <h2 className="font-serif text-[32px] leading-none">Metti la prima casa.</h2>
          <p className="mt-2 text-body text-[#b7aea4]">Dopo Google. Un minuto.</p>
          <div className="mt-5 flex justify-center">
            <GoogleCtaButton href="/auth/google" />
          </div>
        </section>
      </main>
    </div>
  );
}

function Block({ kicker, title, children }: { kicker: string; title: string; children: string }) {
  return (
    <div>
      <p className="text-eyebrow font-semibold uppercase text-[#e07a4c]">{kicker}</p>
      <h2 className="mt-1 font-serif text-[28px] leading-tight">{title}</h2>
      <p className="mt-2 max-w-md text-body text-[#b7aea4]">{children}</p>
    </div>
  );
}

function Price({
  name,
  amount,
  note,
  featured,
}: {
  name: string;
  amount: string;
  note: string;
  featured?: boolean;
}) {
  return (
    <article className={`rounded-2xl border px-4 py-3 ${featured ? 'border-[#e07a4c]' : 'border-white/10'}`}>
      <p className="text-body-sm text-[#b7aea4]">{name}</p>
      <p className="font-serif text-[28px] leading-none">{amount}</p>
      <p className="mt-1 text-body-sm text-[#8a8178]">{note}</p>
    </article>
  );
}

function Night() {
  const items = [
    ['23:47 · l’ospite', 'Non riesco a dormire. C’è troppo rumore.', '#b7aea4'],
    ['23:48 · Premura', 'Posso farti arrivare dei tappi in 30 minuti. 4 euro. Vuoi?', '#e07a4c'],
    ['Tu', 'Un sì. 4 euro. Poi torni a dormire.', '#e0b080'],
  ] as const;
  return (
    <div className="flex flex-col gap-2">
      {items.map(([when, line, color]) => (
        <article
          key={when}
          className="rounded-2xl border border-white/10 px-4 py-3"
          style={{ background: 'rgb(255 255 255 / 0.04)' }}
        >
          <p className="text-eyebrow font-semibold uppercase" style={{ color }}>
            {when}
          </p>
          <p className="mt-1 text-body">{line}</p>
        </article>
      ))}
    </div>
  );
}
