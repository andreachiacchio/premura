import { BackLink } from '@/components/BackLink';
import { getCurrentHostId } from '@/lib/auth';
import { AddPropertyWizard } from './_components/AddPropertyWizard';

// Wizard "Aggiungi struttura". L'import da annuncio e' il cuore: la
// fonte la porta l'host (testo incollato o screenshot), Claude estrae,
// l'host corregge. Vedi actions.ts per le regole (no scraping, mai
// inventare).

export const dynamic = 'force-dynamic';

export default async function NewPropertyPage() {
  await getCurrentHostId();

  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory px-5 pt-10 pb-16 lg:max-w-2xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[clamp(28px,5vw,40px)] leading-tight text-ink">
            Aggiungi struttura
          </h1>
          <p className="mt-1 text-body-sm text-ink-mute">
            Dall'annuncio esistente o da zero: pochi minuti, poi pensa a tutto Premura.
          </p>
        </div>
        <BackLink href="/properties">Strutture</BackLink>
      </header>

      <AddPropertyWizard />
    </main>
  );
}
