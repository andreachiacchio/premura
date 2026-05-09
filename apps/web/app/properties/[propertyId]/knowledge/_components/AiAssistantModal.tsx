'use client';

import { useState, useTransition } from 'react';
import {
  type ParseKnowledgeResult,
  applyParsedKnowledgeAction,
  parseKnowledgeAction,
} from '../actions';

type Parsed = Extract<ParseKnowledgeResult, { ok: true }>['parsed'];

export function AiAssistantModal({ propertyId }: { propertyId: string }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [costUsd, setCostUsd] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [applied, setApplied] = useState(false);

  function reset(): void {
    setText('');
    setParsed(null);
    setCostUsd(null);
    setError(null);
    setApplied(false);
  }

  function handleParse(): void {
    setError(null);
    setParsed(null);
    setApplied(false);
    if (text.trim().length < 20) {
      setError('Incolla almeno 20 caratteri.');
      return;
    }
    startTransition(async () => {
      const r = await parseKnowledgeAction(propertyId, text);
      if (!r.ok) {
        setError(`Errore parser: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
        return;
      }
      setParsed(r.parsed);
      setCostUsd(r.costUsd);
    });
  }

  function handleApply(): void {
    if (!parsed) return;
    setError(null);
    startTransition(async () => {
      const r = await applyParsedKnowledgeAction(propertyId, parsed);
      if (!r.ok) {
        setError(`Errore applicazione: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
        return;
      }
      setApplied(true);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-card border border-line bg-paper px-3 py-2 text-body-sm text-ink hover:border-terracotta"
      >
        ✨ Importa da testo libero
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-8">
      <div className="max-h-full w-full max-w-2xl overflow-auto rounded-card bg-paper p-5 shadow-lg">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Importa knowledge da testo libero</h2>
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            className="text-ink-mute hover:text-ink"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </header>

        <p className="mb-3 text-body-sm text-ink-soft">
          Incolla qualsiasi testo (manuale ospiti, email, note). Premura estrae i campi strutturati
          che riconosce. Tu decidi cosa applicare.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          maxLength={15000}
          placeholder="Wifi: LaGocciaWiFi password 1234abcd&#10;Keybox: 5821 vicino al portone a sinistra&#10;Pasticciotti da Scaturchio (5 min a piedi)…"
          className="w-full rounded-card border border-line bg-paper px-3 py-2 text-body text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none"
        />

        {error && (
          <div className="mt-3 rounded-md border border-terracotta-2/40 bg-peach px-3 py-2 text-body-sm text-terracotta-2">
            {error}
          </div>
        )}

        {!parsed && (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleParse}
              disabled={pending || text.trim().length < 20}
              className="rounded-full bg-terracotta px-5 py-2 text-body-sm font-medium text-paper shadow-sm hover:bg-terracotta-2 disabled:opacity-60"
            >
              {pending ? 'Estrazione…' : 'Estrai con AI'}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="rounded-full border border-line bg-paper px-5 py-2 text-body-sm text-ink-mute hover:text-ink"
            >
              Annulla
            </button>
          </div>
        )}

        {parsed && !applied && (
          <section className="mt-4 rounded-card border border-line bg-bg-soft p-3">
            <header className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-medium text-ink">Anteprima estrazione</h3>
              {costUsd !== null && (
                <span className="text-xs text-ink-mute">costo ${costUsd.toFixed(4)}</span>
              )}
            </header>
            <ParsedPreview parsed={parsed} />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleApply}
                disabled={pending}
                className="rounded-full bg-terracotta px-5 py-2 text-body-sm font-medium text-paper shadow-sm hover:bg-terracotta-2 disabled:opacity-60"
              >
                {pending ? 'Applicazione…' : 'Applica tutto'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setParsed(null);
                  setCostUsd(null);
                }}
                className="rounded-full border border-line bg-paper px-5 py-2 text-body-sm text-ink-mute hover:text-ink"
              >
                Riprova
              </button>
            </div>
          </section>
        )}

        {applied && (
          <section className="mt-4 rounded-card border border-ok/30 bg-line-soft p-4 text-center">
            <p className="text-base font-medium text-ok">✓ Knowledge applicata</p>
            <p className="mt-1 text-body-sm text-ink-mute">
              I campi sono stati salvati. Ricarica la pagina per vederli nelle sezioni.
            </p>
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="mt-3 rounded-full bg-terracotta px-5 py-2 text-body-sm font-medium text-paper shadow-sm hover:bg-terracotta-2"
            >
              Chiudi
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

function ParsedPreview({ parsed }: { parsed: Parsed }): React.JSX.Element {
  const items: Array<{ label: string; value: string }> = [];
  if (parsed.wifi?.ssid) items.push({ label: 'WiFi SSID', value: parsed.wifi.ssid });
  if (parsed.wifi?.password) items.push({ label: 'WiFi password', value: parsed.wifi.password });
  if (parsed.keybox?.code) items.push({ label: 'Keybox code', value: parsed.keybox.code });
  if (parsed.keybox?.instructions)
    items.push({ label: 'Keybox istruzioni', value: parsed.keybox.instructions });
  if (parsed.parking?.type) items.push({ label: 'Parcheggio tipo', value: parsed.parking.type });
  if (parsed.checkInInstructions)
    items.push({ label: 'Check-in', value: parsed.checkInInstructions });
  if (parsed.checkOutInstructions)
    items.push({ label: 'Check-out', value: parsed.checkOutInstructions });
  if (parsed.languageDefault)
    items.push({ label: 'Lingua default', value: parsed.languageDefault });

  return (
    <div className="space-y-2 text-body-sm">
      {items.map((it) => (
        <div key={it.label} className="flex gap-2">
          <span className="min-w-[120px] font-medium text-ink-mute">{it.label}:</span>
          <span className="text-ink">{it.value}</span>
        </div>
      ))}
      {parsed.emergencyContacts && parsed.emergencyContacts.length > 0 && (
        <div>
          <p className="font-medium text-ink-mute">Contatti emergenza:</p>
          <ul className="ml-4 list-disc">
            {parsed.emergencyContacts.map((c) => (
              <li key={`${c.name}-${c.phone}`} className="text-ink">
                {c.name} ({c.role}) — {c.phone}
              </li>
            ))}
          </ul>
        </div>
      )}
      {parsed.localTipsCuratedHost && parsed.localTipsCuratedHost.length > 0 && (
        <div>
          <p className="font-medium text-ink-mute">
            Posti consigliati ({parsed.localTipsCuratedHost.length}):
          </p>
          <ul className="ml-4 list-disc">
            {parsed.localTipsCuratedHost.map((t) => (
              <li key={`${t.category}-${t.name}`} className="text-ink">
                <span className="text-ink-mute">[{t.category}]</span> {t.name}
                {t.distanceMin ? ` (${t.distanceMin} min)` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {items.length === 0 &&
        (!parsed.emergencyContacts || parsed.emergencyContacts.length === 0) &&
        (!parsed.localTipsCuratedHost || parsed.localTipsCuratedHost.length === 0) && (
          <p className="text-ink-mute">Nessun campo estraibile dal testo.</p>
        )}
    </div>
  );
}
