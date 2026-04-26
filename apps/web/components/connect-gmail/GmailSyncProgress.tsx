'use client';

import { type ReactElement, useEffect, useState } from 'react';
import { Card } from '@/components/Card';
import { Eyebrow } from '@/components/Eyebrow';
import { Heading } from '@/components/Heading';
import { Button } from '@/components/Button';

// Componente progress bar lato host (M2a.3 Fase 2).
// Lifecycle:
//   1. on mount: POST /api/gmail/sync → riceve jobId
//   2. polling ogni 1.5s GET /api/gmail/sync/status?jobId=X
//   3. quando status='completed' → mostra summary
//   4. quando status='failed' → mostra errore + bottone retry
//
// Design: Card del design system Premura, Heading Fraunces, palette
// ink/paper. Niente emoji.

type JobStatus = {
  id: string;
  status: 'running' | 'completed' | 'failed';
  totalEmails: number;
  processedEmails: number;
  enrichedCount: number;
  createdCount: number;
  skippedPast: number;
  skippedNoMatch: number;
  skippedNotConfirmation: number;
  cancelledCount: number;
  guestProfilesCreated: number;
  guestProfilesUpdated: number;
  fatalError: string | null;
};

type LocalState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'polling'; jobId: string; job: JobStatus | null }
  | { phase: 'done'; job: JobStatus }
  | { phase: 'error'; message: string };

export function GmailSyncProgress(): ReactElement {
  const [state, setState] = useState<LocalState>({ phase: 'idle' });

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function start(): Promise<void> {
      setState({ phase: 'starting' });
      try {
        const res = await fetch('/api/gmail/sync', { method: 'POST' });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          if (cancelled) return;
          setState({
            phase: 'error',
            message: body.error ?? `Errore avvio sync (HTTP ${res.status})`,
          });
          return;
        }
        const { jobId } = (await res.json()) as { jobId: string };
        if (cancelled) return;
        setState({ phase: 'polling', jobId, job: null });
        poll(jobId);
      } catch (err) {
        if (cancelled) return;
        setState({
          phase: 'error',
          message: err instanceof Error ? err.message : 'Errore di rete',
        });
      }
    }

    async function poll(jobId: string): Promise<void> {
      try {
        const res = await fetch(`/api/gmail/sync/status?jobId=${encodeURIComponent(jobId)}`);
        if (!res.ok) {
          if (cancelled) return;
          setState({ phase: 'error', message: `Polling fallito (HTTP ${res.status})` });
          return;
        }
        const job = (await res.json()) as JobStatus;
        if (cancelled) return;
        if (job.status === 'completed') {
          setState({ phase: 'done', job });
          return;
        }
        if (job.status === 'failed') {
          setState({
            phase: 'error',
            message: job.fatalError ?? 'Sync fallito (motivo non specificato)',
          });
          return;
        }
        setState({ phase: 'polling', jobId, job });
        pollTimer = setTimeout(() => poll(jobId), 1500);
      } catch (err) {
        if (cancelled) return;
        setState({
          phase: 'error',
          message: err instanceof Error ? err.message : 'Errore polling',
        });
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, []);

  if (state.phase === 'idle' || state.phase === 'starting') {
    return (
      <Card padding="loose" className="mt-10">
        <Eyebrow>Sincronizzazione</Eyebrow>
        <Heading level={3} className="mt-3">
          Stiamo aprendo la tua casella Gmail…
        </Heading>
        <p className="mt-4 text-body text-ink-soft">
          Questo dovrebbe richiedere qualche secondo.
        </p>
      </Card>
    );
  }

  if (state.phase === 'polling') {
    const total = state.job?.totalEmails ?? 0;
    const processed = state.job?.processedEmails ?? 0;
    const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
    return (
      <Card padding="loose" className="mt-10">
        <Eyebrow>Sincronizzazione in corso</Eyebrow>
        <Heading level={3} className="mt-3">
          {total === 0
            ? 'Stiamo cercando le email Airbnb degli ultimi 90 giorni…'
            : 'Stiamo leggendo le tue email Airbnb degli ultimi 90 giorni…'}
        </Heading>
        {total > 0 ? (
          <div className="mt-6">
            <p className="text-body text-ink-soft">
              {processed} su {total} email letta{processed === 1 ? '' : 'e'}.
            </p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full bg-terracotta transition-[width] duration-300"
                style={{ width: `${pct}%` }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              />
            </div>
          </div>
        ) : null}
        <p className="mt-6 text-body-sm text-ink-mute">
          Puoi lasciare aperta questa pagina e tornare quando vuoi: le prenotazioni
          rimarranno salvate.
        </p>
      </Card>
    );
  }

  if (state.phase === 'done') {
    const j = state.job;
    const enrichedOrCreated = j.enrichedCount + j.createdCount;
    const profilesTotal = j.guestProfilesCreated + j.guestProfilesUpdated;
    return (
      <Card padding="loose" className="mt-10">
        <Eyebrow variant="terracotta">Sincronizzazione completata</Eyebrow>
        <Heading level={3} className="mt-3">
          {enrichedOrCreated > 0
            ? `Trovate ${enrichedOrCreated} prenotazion${enrichedOrCreated === 1 ? 'e' : 'i'} future`
            : 'Nessuna prenotazione futura trovata negli ultimi 90 giorni'}
        </Heading>
        <ul className="mt-6 space-y-2 text-body text-ink-soft">
          <li>
            <span className="font-semibold text-ink">{j.totalEmails}</span> email Airbnb
            esaminate
          </li>
          <li>
            <span className="font-semibold text-ink">{j.createdCount}</span> nuove prenotazioni
            create,{' '}
            <span className="font-semibold text-ink">{j.enrichedCount}</span> prenotazioni iCal
            arricchite
          </li>
          <li>
            <span className="font-semibold text-ink">{j.guestProfilesCreated}</span> nuovi
            ospiti registrati,{' '}
            <span className="font-semibold text-ink">{j.guestProfilesUpdated}</span> ospiti
            ricorrenti aggiornati
          </li>
          {j.skippedPast > 0 ? (
            <li>
              <span className="font-semibold text-ink">{j.skippedPast}</span> prenotazioni
              passate ignorate (check-in già avvenuto)
            </li>
          ) : null}
          {j.skippedNoMatch > 0 ? (
            <li>
              <span className="font-semibold text-ink">{j.skippedNoMatch}</span> prenotazioni
              non associate a una struttura registrata
            </li>
          ) : null}
        </ul>
        <p className="mt-6 text-body-sm text-ink-mute">
          {profilesTotal === 0 && enrichedOrCreated === 0
            ? null
            : 'Da adesso ogni nuova prenotazione viene letta automaticamente.'}
        </p>
        <div className="mt-8">
          <Button as="a" href="/dashboard" variant="primary" size="lg">
            Vai alla dashboard →
          </Button>
        </div>
      </Card>
    );
  }

  // error
  return (
    <Card padding="loose" className="mt-10">
      <Eyebrow>Sincronizzazione fallita</Eyebrow>
      <Heading level={3} className="mt-3">
        Qualcosa non ha funzionato
      </Heading>
      <p className="mt-4 text-body text-ink-soft">{state.message}</p>
      <p className="mt-4 text-body-sm text-ink-mute">
        Le prossime prenotazioni verranno comunque lette nei prossimi giorni. Se preferisci,
        puoi riprovare adesso.
      </p>
      <div className="mt-8 flex gap-4">
        <Button as="a" href="/connect-gmail" variant="primary">
          Riprova
        </Button>
        <Button as="a" href="/dashboard" variant="ghost">
          Vai alla dashboard
        </Button>
      </div>
    </Card>
  );
}
