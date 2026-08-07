'use client';

import { Check, Loader2, TriangleAlert } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';

// Form di una sezione di Info casa, con due cose che prima mancavano.
//
// 07/08. L'intestazione prometteva «Tutto si salva da solo» e non era
// vero: nessun autosave e' mai esistito qui. Un host che compilava tre
// sezioni fidandosi di quella riga perdeva tutto chiudendo la scheda,
// senza che niente glielo dicesse.
//
// La decisione e' stata di NON aggiungere l'autosave — su una pagina
// dove si scrivono password WiFi e codici keybox, salvare a meta'
// digitazione congela un valore parziale che l'agente potrebbe usare
// per rispondere a un ospite. Il salvataggio esplicito e' giusto: va
// solo reso evidente.
//
// Quindi due segnali, entrambi legati allo STESSO stato del form:
//  - dopo un salvataggio riuscito, una conferma che si vede
//  - se ci sono modifiche non salvate, un avviso prima di uscire
//
// R2. «Salvato» si scrive solo dopo che la server action e' TORNATA
// senza lanciare. Un'azione fallita smette di essere pending esattamente
// come una riuscita: se la conferma si appendesse a quella transizione
// direbbe «Salvato» anche quando non e' salvato niente.
//
// PERCHE' onSubmit E NON <form action={...}>. Le due cose che perdiamo
// passando all'handler esplicito sono il funzionamento senza JS e
// useFormStatus. Quella che guadagniamo e' il testo dell'host quando il
// salvataggio fallisce: React 19 azzera i campi non controllati dopo
// OGNI form action, riuscita o fallita (verificato — vale anche con
// useActionState). Su questa pagina il fallimento cancellerebbe la
// password WiFi appena digitata, che e' il danno esatto da cui parte
// tutta questa modifica. L'handler non azzera niente.

const CONFERMA_MS = 3000;

function Stato({
  pending,
  sporco,
  salvato,
  fallito,
}: {
  pending: boolean;
  sporco: boolean;
  salvato: boolean;
  fallito: boolean;
}): React.JSX.Element | null {
  if (pending) {
    return (
      <span className="inline-flex items-center gap-1.5 text-body-sm text-ink-mute">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        Salvo…
      </span>
    );
  }
  // <output> e' l'elemento giusto per entrambi gli esiti: e' il risultato
  // di quello che il form ha appena fatto, e i lettori di schermo lo
  // annunciano da soli.
  if (fallito) {
    return (
      <output className="inline-flex items-center gap-1.5 text-body-sm font-medium text-terracotta-2">
        <TriangleAlert aria-hidden className="size-4" />
        Non sono riuscito a salvare. Quello che hai scritto è ancora qui: riprova.
      </output>
    );
  }
  if (salvato) {
    return (
      <output className="inline-flex items-center gap-1.5 text-body-sm font-medium text-ok">
        <Check aria-hidden className="size-4" />
        Salvato
      </output>
    );
  }
  if (sporco) {
    return <span className="text-body-sm text-terracotta-2">Modifiche non salvate</span>;
  }
  return null;
}

export function SectionForm({
  action,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
}): React.JSX.Element {
  const [pending, startTransition] = useTransition();
  const [sporco, setSporco] = useState(false);
  const [fallito, setFallito] = useState(false);
  // Contatore, non booleano: due salvataggi di fila devono far ripartire
  // il timer della conferma, e con un booleano gia' true non cambierebbe
  // niente.
  const [salvataggi, setSalvataggi] = useState(0);

  useEffect(() => {
    if (salvataggi === 0) return;
    const t = setTimeout(() => setSalvataggi(0), CONFERMA_MS);
    return () => clearTimeout(t);
  }, [salvataggi]);

  // Avviso di uscita: il browser lo mostra solo se c'e' davvero qualcosa
  // da perdere. Si registra quando il form e' sporco e si toglie appena
  // e' pulito — un listener sempre attivo darebbe l'avviso anche a chi
  // non ha toccato niente, e si impara a ignorarlo.
  useEffect(() => {
    if (!sporco) return;
    const onLeave = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [sporco]);

  // Appena si ritocca qualcosa la conferma sparisce: «Salvato» accanto a
  // una modifica non ancora salvata sarebbe falso quanto la riga che
  // abbiamo appena tolto dall'intestazione.
  const tocca = (): void => {
    setSporco(true);
    setSalvataggi(0);
    setFallito(false);
  };

  const salva = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await action(fd);
      } catch (err) {
        // L'errore si vede nel form e resta nei log del browser. Non
        // risale: se risalisse React smonterebbe l'albero e si
        // porterebbe via quello che l'host ha appena scritto.
        console.error('[SectionForm] salvataggio fallito', err);
        setFallito(true);
        return;
      }
      setFallito(false);
      setSporco(false);
      setSalvataggi((n) => n + 1);
    });
  };

  // onInput copre testo e textarea, onChange copre select e checkbox.
  // Marcare due volte lo stesso stato non fa danno; non marcarlo affatto
  // su una select vorrebbe dire perdere la lingua default senza avviso.
  return (
    <form onSubmit={salva} onInput={tocca} onChange={tocca} className="flex flex-col gap-3">
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-full bg-terracotta px-5 text-body-sm font-medium text-paper shadow-sm transition-colors hover:bg-terracotta-2 disabled:opacity-60"
        >
          Salva sezione
        </button>
        <Stato pending={pending} sporco={sporco} salvato={salvataggi > 0} fallito={fallito} />
      </div>
    </form>
  );
}
