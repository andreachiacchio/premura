import { GoogleCtaButton } from '@/components/landing/GoogleCtaButton';
import Link from 'next/link';

export function LiveLanding() {
  return (
    <div className="min-h-screen bg-[#07080c] text-[#f6f1ea]">
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 lg:min-h-screen lg:grid-cols-2 lg:px-10">
          <div>
            <p className="text-eyebrow font-semibold uppercase text-[#b7aea4]">Premura</p>
            <h1 className="mt-4 font-serif text-[44px] leading-[0.95] tracking-[-0.03em] sm:text-[68px]">
              Accanto a ogni ospite.
            </h1>
            <p className="mt-5 max-w-md text-body-lg text-[#b7aea4]">
              Per tutto il soggiorno. Anche alle due di notte. Tu dici sì solo se ci sono dei soldi.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <GoogleCtaButton href="/auth/google" />
              <Link href="/login" className="text-body-sm text-[#b7aea4] underline underline-offset-4">
                Sei già host Premura? Accedi
              </Link>
            </div>
            <p className="mt-3 max-w-md text-body-sm text-[#8a8178]">
              Entri con Google. Poi metti la casa.
            </p>
          </div>
          <Night />
        </section>

        <section className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-2 lg:px-10">
          <div>
            <p className="text-eyebrow font-semibold uppercase text-[#e07a4c]">Chi siamo</p>
            <h2 className="mt-3 font-serif text-[36px] leading-none">L’assistente della casa.</h2>
            <p className="mt-4 max-w-md text-body text-[#b7aea4]">
              Non un gestionale e non un call center. Premura sta con l’ospite quando tu non ci sei. Si presenta.
              Non finge di essere te.
            </p>
          </div>
          <div>
            <p className="text-eyebrow font-semibold uppercase text-[#e07a4c]">Cosa vogliamo</p>
            <h2 className="mt-3 font-serif text-[36px] leading-none">Che tu non apra WhatsApp.</h2>
            <p className="mt-4 max-w-md text-body text-[#b7aea4]">
              L’ospite scrive. Premura capisce e agisce. Sotto una cifra piccola va avanti e ti avvisa. Sopra, si
              ferma e aspetta il tuo sì.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-6 lg:px-10">
          <p className="text-eyebrow font-semibold uppercase text-[#e07a4c]">I servizi</p>
          <h2 className="mt-3 max-w-xl font-serif text-[36px] leading-none">
            Una cosa da offrire. Il prezzo è già scritto.
          </h2>
          <p className="mt-4 max-w-xl text-body text-[#b7aea4]">
            In costiera può essere il gozzo, il transfer o il cuoco. A Napoli il gozzo non c’è. L’ospite vede
            un’offerta sola, con il prezzo. Il fornitore non si nomina. Su ogni sì, Premura tiene il quindici per
            cento, già dentro quella cifra.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 lg:px-10">
          <p className="text-eyebrow font-semibold uppercase text-[#e07a4c]">Prezzi</p>
          <h2 className="mt-3 font-serif text-[36px] leading-none">Trasparente, come un host dovrebbe essere.</h2>
          <p className="mt-3 max-w-xl text-body text-[#b7aea4]">
            Una cifra al mese per casa. Nessun costo di ingresso, nessun contratto annuale.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Price name="1 casa" amount="9,99 €" note="al mese" />
            <Price name="2–5 case" amount="14,99 €" note="al mese, per casa" featured />
            <Price name="6 o più" amount="19,99 €" note="al mese, per casa" />
          </div>
          <p className="mt-6 max-w-xl text-body-sm text-[#8a8178]">
            Più case, più lavoro, cifra più alta. Gratis fino al check-out del primo ospite. Nessuna carta. Il
            kit, quando ci sarà, resta al costo. Il margine è sulla commissione, non sul kit.
          </p>
        </section>

        <section className="mx-auto max-w-3xl px-5 py-20 text-center">
          <h2 className="font-serif text-[40px] leading-none">Metti la prima casa.</h2>
          <p className="mx-auto mt-4 max-w-md text-body text-[#b7aea4]">Dopo Google. Un minuto.</p>
          <div className="mt-8 flex justify-center">
            <GoogleCtaButton href="/auth/google" />
          </div>
        </section>
      </main>
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
    <article
      className={`rounded-[20px] border p-5 ${
        featured ? 'border-[#e07a4c]' : 'border-white/10'
      }`}
    >
      <p className="text-body-sm text-[#b7aea4]">{name}</p>
      <p className="mt-2 font-serif text-[36px]">{amount}</p>
      <p className="mt-1 text-body-sm text-[#8a8178]">{note}</p>
    </article>
  );
}

function Night() {
  const card =
    'absolute inset-x-0 rounded-[20px] border border-white/15 p-5';
  const glass = {
    background: 'linear-gradient(180deg, rgb(255 255 255 / 0.1), rgb(255 255 255 / 0.03))',
  };
  return (
    <div className="relative mx-auto h-[420px] w-full max-w-md" style={{ perspective: '900px' }}>
      <div className="relative h-full" style={{ transform: 'rotateX(8deg) rotateY(-8deg)', transformStyle: 'preserve-3d' }}>
        <article className={`${card} top-1`} style={{ ...glass, transform: 'translateZ(-24px)' }}>
          <p className="text-eyebrow font-semibold uppercase text-[#b7aea4]">23:47 · l’ospite</p>
          <p className="mt-3 text-body-lg">Non riesco a dormire. C’è troppo rumore.</p>
        </article>
        <article className={`${card} top-28`} style={{ ...glass, transform: 'translateZ(12px)' }}>
          <p className="text-eyebrow font-semibold uppercase text-[#e07a4c]">23:48 · Premura</p>
          <p className="mt-3 text-body-lg">Posso farti arrivare dei tappi in 30 minuti. 4 euro. Vuoi?</p>
        </article>
        <article className={`${card} top-52`} style={{ ...glass, transform: 'translateZ(40px)' }}>
          <p className="text-eyebrow font-semibold uppercase text-[#e0b080]">Tu</p>
          <p className="mt-3 text-body-lg">Un sì. 4 euro. Poi torni a dormire.</p>
        </article>
      </div>
    </div>
  );
}
