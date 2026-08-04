import { Container } from '@/components/Container';
import { Eyebrow } from '@/components/Eyebrow';
import { Heading } from '@/components/Heading';
import type { ReactNode } from 'react';

// Brief "missione" 04/08, punto 5: la dashboard in grande, pezzo visivo
// forte della pagina. Mockup mobile realistici costruiti in HTML/CSS
// (specchiano le schermate vere: Prossimi check-in e Conversazioni con
// bozza da approvare). Dati inventati — mai nomi di ospiti reali.

function PhoneFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <figure className="mx-auto w-full max-w-[340px]">
      <div className="rounded-[36px] border border-line bg-ink p-2 shadow-lg">
        <div className="overflow-hidden rounded-[28px] bg-ivory">
          <div className="flex items-center justify-between px-5 pt-3 pb-1">
            <span className="text-[11px] font-semibold text-ink tabular-nums">9:41</span>
            <span aria-hidden="true" className="h-[10px] w-16 rounded-full bg-ink/10" />
          </div>
          {children}
        </div>
      </div>
      <figcaption className="mt-4 text-center text-body-sm text-ink-mute">{label}</figcaption>
    </figure>
  );
}

function CheckinScreen() {
  return (
    <div className="px-4 pb-6 pt-2">
      <p className="font-serif text-h4 text-ink">Prossimi check-in</p>
      <div className="mt-3 space-y-2.5">
        <div className="rounded-[14px] border border-line bg-paper p-3.5">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-terracotta" />
            <p className="text-body-sm font-semibold text-ink">Casa Vista Mare</p>
            <span className="ml-auto rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-semibold text-ok">
              Tutto pronto
            </span>
          </div>
          <p className="mt-2 text-body-sm text-ink-soft">Sofia R. · 2 ospiti · oggi, 15:00</p>
          <p className="mt-1 text-[12px] text-ink-mute">Benvenuto inviato · guida della casa aperta</p>
        </div>
        <div className="rounded-[14px] border border-line bg-paper p-3.5">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-gold-deep" />
            <p className="text-body-sm font-semibold text-ink">Mansarda del Corso</p>
            <span className="ml-auto rounded-full bg-warn/10 px-2 py-0.5 text-[11px] font-semibold text-gold-deep">
              Manca il numero
            </span>
          </div>
          <p className="mt-2 text-body-sm text-ink-soft">M. Keller · 4 ospiti · domani, 16:00</p>
          <p className="mt-1 text-[12px] text-ink-mute">Aggiungi il telefono per il benvenuto</p>
        </div>
        <div className="rounded-[14px] border border-line bg-paper p-3.5">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ink-soft" />
            <p className="text-body-sm font-semibold text-ink">Casa Vista Mare</p>
            <span className="ml-auto rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
              Sabato
            </span>
          </div>
          <p className="mt-2 text-body-sm text-ink-soft">J. Dubois · 3 ospiti · sab, 14:00</p>
        </div>
      </div>
    </div>
  );
}

function ConversationScreen() {
  return (
    <div className="px-4 pb-6 pt-2">
      <p className="font-serif text-h4 text-ink">Conversazioni</p>
      <div className="mt-3 rounded-[14px] border border-line bg-paper p-3.5">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-terracotta" />
          <p className="text-body-sm font-semibold text-ink">Sofia R. · Casa Vista Mare</p>
          <span className="ml-auto text-[11px] text-ink-mute">23:47</span>
        </div>
        <div className="mt-3 max-w-[90%] rounded-[12px] rounded-tl-[3px] bg-ivory-warm px-3 py-2">
          <p className="text-body-sm text-ink">Domattina possiamo lasciare le valigie da voi?</p>
        </div>
        <div className="mt-2.5 rounded-[12px] border border-terracotta-soft bg-paper-deep px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-terracotta">
            Bozza pronta
          </p>
          <p className="mt-1 text-body-sm text-ink">
            Ciao Sofia! Ti risponde l&apos;assistente automatico di Casa Vista Mare. Ho girato la
            richiesta all&apos;host, ti risponde appena possibile…
          </p>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="flex-1 rounded-full bg-ink px-3 py-1.5 text-center text-[12px] font-semibold text-paper">
            Approva
          </span>
          <span className="flex-1 rounded-full border border-line px-3 py-1.5 text-center text-[12px] font-semibold text-ink">
            Modifica
          </span>
          <span className="rounded-full border border-line px-3 py-1.5 text-center text-[12px] font-semibold text-ink-mute">
            Scarta
          </span>
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] text-ink-mute">
        Niente parte senza il tuo tocco.
      </p>
    </div>
  );
}

export function ProductShowcase() {
  return (
    <section className="py-20 md:py-28 bg-paper-deep">
      <Container>
        <Eyebrow>Il prodotto</Eyebrow>
        <Heading level={2} className="mt-3 max-w-2xl">
          Tutta la tua giornata, in due schermate.
        </Heading>
        <p className="mt-6 max-w-2xl text-body-lg text-ink-soft">
          Niente timeline, niente log, niente task list. Chi arriva, cosa serve, cosa c&apos;è da
          approvare. Il resto lo tiene Premura.
        </p>

        <div className="mt-14 grid gap-10 md:grid-cols-2 md:gap-8 lg:mx-auto lg:max-w-4xl">
          <PhoneFrame label="I prossimi arrivi, con lo stato di ognuno.">
            <CheckinScreen />
          </PhoneFrame>
          <PhoneFrame label="Le risposte pronte, in attesa del tuo tocco.">
            <ConversationScreen />
          </PhoneFrame>
        </div>
      </Container>
    </section>
  );
}

export default ProductShowcase;
