import { BackLink } from '@/components/BackLink';
import { CleanerForm } from '../_components/CleanerForm';

export const dynamic = 'force-dynamic';

export default function NewCleanerPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-6">
        <BackLink href="/dashboard/cleaners">Cleaner</BackLink>
        <h1 className="text-2xl font-semibold text-ink">Aggiungi cleaner</h1>
        <p className="mt-1 text-sm text-ink-mute">
          Le persone che si occupano delle pulizie ricevono i kit a casa loro, li allestiscono e
          scattano la foto del setup.
        </p>
      </header>
      <CleanerForm />
    </div>
  );
}
