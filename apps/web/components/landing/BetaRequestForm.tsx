'use client';

import { Button } from '@/components/Button';
import {
  type BetaRequestResponse,
  MAX_PROPERTY_COUNT_BETA,
  MIN_PROPERTY_COUNT_BETA,
  betaRequestBodySchema,
} from '@/lib/beta-request-schema';
import { cn } from '@/lib/cn';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';

// Slice I — Form richiesta accesso beta privata.
// Sostituisce il WaitlistForm: stesso stile, tutti i campi richiesti tranne
// città/tipo. Andrea risponde manualmente entro 24h.

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; duplicate: boolean; fullName: string }
  | { kind: 'error'; message: string };

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

export function BetaRequestForm() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [propertyCount, setPropertyCount] = useState<number>(1);
  const [cityAndType, setCityAndType] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const submitting = status.kind === 'submitting';
  const errored = status.kind === 'error';

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    const parsed = betaRequestBodySchema.safeParse({
      email,
      fullName,
      propertyCount,
      cityAndType: cityAndType.trim() === '' ? undefined : cityAndType,
      privacyAccepted,
    });

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message;
      setStatus({
        kind: 'error',
        message: firstIssue ?? 'Controlla i campi compilati.',
      });
      return;
    }

    setStatus({ kind: 'submitting' });

    try {
      const res = await fetch('/api/beta-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const json: BetaRequestResponse = await res.json();

      if (json.ok) {
        setStatus({ kind: 'success', duplicate: json.duplicate, fullName });
        return;
      }
      setStatus({
        kind: 'error',
        message:
          json.error === 'rate_limit'
            ? 'Troppi tentativi. Riprova tra qualche minuto.'
            : (json.message ?? 'Qualcosa non va. Riprova tra poco.'),
      });
    } catch {
      setStatus({ kind: 'error', message: 'Connessione caduta. Riprova tra poco.' });
    }
  }

  if (status.kind === 'success') {
    return <SuccessCard duplicate={status.duplicate} fullName={status.fullName} />;
  }

  const inputBase = cn(
    'mt-2 w-full h-12 rounded-[12px] border border-line bg-paper px-4 text-body text-ink placeholder:text-ink-ghost',
    'transition-colors focus-visible:outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/20',
    'disabled:opacity-60',
  );

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4"
      aria-label="Richiesta accesso beta"
    >
      <div>
        <label htmlFor="beta-email" className="block text-body-sm font-semibold text-ink">
          La tua email
        </label>
        <input
          id="beta-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          placeholder="andrea@esempio.it"
          className={inputBase}
        />
      </div>

      <div>
        <label htmlFor="beta-name" className="block text-body-sm font-semibold text-ink">
          Come ti chiami?
        </label>
        <input
          id="beta-name"
          type="text"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={submitting}
          maxLength={255}
          placeholder="Andrea Chiacchio"
          className={inputBase}
        />
      </div>

      <div>
        <label htmlFor="beta-count" className="block text-body-sm font-semibold text-ink">
          Quante strutture gestisci?
        </label>
        <input
          id="beta-count"
          type="number"
          inputMode="numeric"
          required
          min={MIN_PROPERTY_COUNT_BETA}
          max={MAX_PROPERTY_COUNT_BETA}
          value={propertyCount}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            setPropertyCount(
              Math.max(MIN_PROPERTY_COUNT_BETA, Math.min(MAX_PROPERTY_COUNT_BETA, n)),
            );
          }}
          disabled={submitting}
          className={cn(inputBase, 'tabular-nums')}
        />
      </div>

      <div>
        <label htmlFor="beta-city-type" className="block text-body-sm font-semibold text-ink">
          Città + tipo struttura <span className="font-normal text-ink-mute">(opzionale)</span>
        </label>
        <textarea
          id="beta-city-type"
          rows={2}
          maxLength={240}
          value={cityAndType}
          onChange={(e) => setCityAndType(e.target.value)}
          disabled={submitting}
          placeholder="Es: Bologna, 2 appartamenti centro storico"
          className={cn(
            'mt-2 w-full rounded-[12px] border border-line bg-paper px-4 py-3 text-body text-ink placeholder:text-ink-ghost',
            'transition-colors focus-visible:outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/20',
            'disabled:opacity-60 resize-none',
          )}
        />
      </div>

      <label className="flex items-start gap-3 text-body-sm text-ink-soft">
        <input
          type="checkbox"
          checked={privacyAccepted}
          onChange={(e) => setPrivacyAccepted(e.target.checked)}
          disabled={submitting}
          required
          className="mt-1 size-4 shrink-0 accent-terracotta"
        />
        <span>
          Accetto che Andrea, founder di Premura, mi contatti via email per parlare della beta.
          Niente newsletter, niente marketing — leggi la{' '}
          <Link
            href="/privacy"
            className="underline underline-offset-2 decoration-line hover:text-ink hover:decoration-ink"
          >
            privacy
          </Link>
          .
        </span>
      </label>

      <Button
        type="submit"
        variant="accent"
        size="lg"
        disabled={submitting}
        rightIcon={submitting ? null : ArrowRight}
        className="w-full"
      >
        {submitting ? 'Invio richiesta…' : 'Invia richiesta'}
      </Button>

      {errored ? (
        <p role="alert" className="text-body-sm text-terracotta-2">
          {status.message}
        </p>
      ) : null}

      <p className="text-body-sm text-ink-mute">
        Andrea, founder di Premura, ti risponderà personalmente. Nessun bot, nessuna automation.
      </p>
    </form>
  );
}

function SuccessCard({ fullName, duplicate }: { fullName: string; duplicate: boolean }) {
  const firstName = fullName.split(/\s+/)[0] ?? fullName;
  return (
    <output
      aria-live="polite"
      className="block rounded-[16px] border border-line bg-paper p-6 md:p-8 shadow-sm"
    >
      <div className="flex items-center gap-3 text-terracotta-2">
        <span
          aria-hidden="true"
          className="grid place-items-center w-7 h-7 rounded-full bg-terracotta-soft text-terracotta-2 font-semibold"
        >
          ✓
        </span>
        <span className="text-eyebrow uppercase font-semibold">
          {duplicate ? 'Ti ho già in lista' : 'Richiesta inviata'}
        </span>
      </div>

      <p className="mt-4 font-serif text-h3 text-ink leading-snug">
        {duplicate
          ? `Eri già con me, ${firstName}. Ti scrivo presto.`
          : `Grazie ${firstName}, ti scrivo entro 24h.`}
      </p>

      <p className="mt-3 text-body text-ink-soft">
        Controlla la posta — ti ho mandato anche una conferma. Se non la trovi, fai un giro nello
        spam.
      </p>

      <p className="mt-5 text-body-sm text-ink-mute">— Andrea</p>
    </output>
  );
}

export default BetaRequestForm;
