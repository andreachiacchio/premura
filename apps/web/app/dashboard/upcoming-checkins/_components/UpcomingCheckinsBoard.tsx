'use client';

import { OccupiedRangesSection } from '@/app/dashboard/_components/OccupiedRangesSection';
import { propertyColorOrFallback } from '@/lib/property-color';
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  type SetPhoneActionResult,
  clearBookingGuestPhoneAction,
  setBookingGuestPhoneAction,
  setBookingPremuraActiveAction,
} from '../actions';

// Board "prossimi check-in" — rifacimento UX (Andrea, 30/07):
//  1. gruppi per URGENZA, non per struttura: "Serve il tuo numero" e
//     "Premura se ne occupa"; la struttura e' il sottotitolo della riga
//  2. via la tabella: nessuna intestazione di colonna, lista di righe
//  3. campo numero solo dove serve, espanso solo sulla riga attiva;
//     le altre righe hanno un "+" che apre il campo
//  4. stato come frase ("in casa, parte domani"), niente badge
//  5. timeline in UNA riga in linguaggio host, dettaglio al tap
//  6. azioni secondarie (Escludi/Attiva, rimuovi numero) dietro "⋯"
// Principio: una gerarchia sola, zero ridondanza, stato in linguaggio
// umano.

// Regola condivisa (lib/format-date): anno solo quando non e' il corrente.
import { dayPhrase, formatDayMonth } from '@/lib/format-date';

const TIME_FMT = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });

export type SurveyStatusUI = 'not_yet' | 'sent' | 'completed' | 'skipped';
export type PremuraStateUI = 'active' | 'missing_phone' | 'excluded';

export type OutboundEntryUI = {
  trigger: 'welcome' | 'midstay' | 'checkout' | 'guest_app_invite';
  status: 'reserved' | 'sent' | 'failed' | 'skipped';
  sentAt: string | null;
  dryRun: boolean;
};

export type UpcomingCheckinCardData = {
  id: string;
  guestFullName: string;
  guestFirstName: string | null;
  propertyId: string;
  propertyName: string;
  propertyColor: string | null;
  checkinAt: string; // ISO string (server -> client)
  checkoutAt: string;
  numGuests: number;
  platform: 'booking' | 'airbnb' | 'direct';
  guestPhone: string | null;
  premuraActiveAt: string | null;
  premuraState: PremuraStateUI;
  surveyStatus: SurveyStatusUI;
  surveySentAt: string | null;
  surveyCompletedAt: string | null;
  welcomeSentAt: string | null;
  outbound: OutboundEntryUI[];
  /** Fascia iCal Booking senza ospite noto: sezione propria, mai
   *  mescolata alle prenotazioni vere (decisione 30/07). */
  unknownOccupied: boolean;
};

export type BoardProps = {
  rows: UpcomingCheckinCardData[];
  properties: Array<{ id: string; name: string; color: string | null }>;
  /** hosts.welcome_time_slot, es. '08:00' — orario previsto del benvenuto. */
  welcomeTimeSlot: string;
};

// ─── Giorni in linguaggio host ─────────────────────────────────────

// dayPhrase vive in lib/format-date (condiviso con le card della home);
// il re-export tiene stabili i test e gli import esistenti.
export { dayPhrase } from '@/lib/format-date';

export function arrivalLabel(checkinIso: string, checkoutIso: string, now: Date): string {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const checkin = new Date(checkinIso);
  const checkinDay = new Date(checkin);
  checkinDay.setHours(0, 0, 0, 0);

  const diffDays = Math.round((checkinDay.getTime() - startOfToday.getTime()) / 86_400_000);
  if (diffDays < 0) {
    // Gia' iniziato: e' "in corso" finche' il checkout non e' passato
    // (il repository non manda soggiorni gia' conclusi).
    return new Date(checkoutIso).getTime() >= now.getTime() ? 'in corso' : 'concluso';
  }
  if (diffDays === 0) return 'oggi';
  if (diffDays === 1) return 'domani';
  return `fra ${diffDays} giorni`;
}

// ─── Stato come frase (punto 4) ────────────────────────────────────

/** "in casa, parte domani" · "arriva sabato · 6 ospiti". */
export function statePhrase(
  row: Pick<UpcomingCheckinCardData, 'checkinAt' | 'checkoutAt' | 'numGuests'>,
  now: Date,
): string {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const checkinDay = new Date(row.checkinAt);
  checkinDay.setHours(0, 0, 0, 0);
  const guests = `${row.numGuests} ${row.numGuests === 1 ? 'ospite' : 'ospiti'}`;

  if (checkinDay.getTime() < startOfToday.getTime()) {
    return `in casa, parte ${dayPhrase(row.checkoutAt, now)}`;
  }
  return `arriva ${dayPhrase(row.checkinAt, now)} · ${guests}`;
}

// ─── Timeline (dettaglio al tap) ───────────────────────────────────

type TimelineItem = { label: string; detail: string; done: boolean };

export function buildTimeline(
  row: UpcomingCheckinCardData,
  welcomeTimeSlot: string,
  now: Date,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  const checkin = new Date(row.checkinAt);
  const bySendTrigger = new Map(row.outbound.map((o) => [o.trigger, o]));

  // Benvenuto: la verita' storica sta in kits.welcome_message_sent_at
  // (slice E) o nello slot outbound 'welcome'; se nessuno dei due, e'
  // previsto il giorno del check-in all'orario configurato dall'host.
  const welcomeSend = bySendTrigger.get('welcome');
  if (row.welcomeSentAt || welcomeSend?.status === 'sent') {
    const at = row.welcomeSentAt ?? welcomeSend?.sentAt;
    const dry = !row.welcomeSentAt && welcomeSend?.dryRun;
    items.push({
      label: 'Benvenuto',
      detail: at
        ? `inviato ${formatDayMonth(new Date(at))} ${TIME_FMT.format(new Date(at))}${dry ? ' (simulato)' : ''}`
        : 'inviato',
      done: true,
    });
  } else if (welcomeSend?.status === 'failed') {
    items.push({ label: 'Benvenuto', detail: 'invio fallito — da sbloccare', done: false });
  } else {
    // Un evento passato non e' mai "previsto" (bug 30/07): se l'orario
    // del benvenuto e' gia' trascorso e nulla e' partito, la verita' e'
    // "non inviato".
    const [slotHours, slotMinutes] = welcomeTimeSlot.split(':').map(Number);
    const expectedAt = new Date(checkin);
    expectedAt.setHours(slotHours ?? 8, slotMinutes ?? 0, 0, 0);
    items.push(
      expectedAt.getTime() < now.getTime()
        ? { label: 'Benvenuto', detail: 'non inviato', done: false }
        : {
            label: 'Benvenuto',
            detail: `previsto ${formatDayMonth(checkin)} ore ${welcomeTimeSlot}`,
            done: false,
          },
    );
  }

  // Survey pre-arrivo: parte a T-7 giorni (±1) al giro delle 09:00.
  if (row.surveyStatus === 'completed') {
    const at = row.surveyCompletedAt;
    items.push({
      label: 'Survey',
      detail: at ? `completata ${formatDayMonth(new Date(at))}` : 'completata',
      done: true,
    });
  } else if (row.surveyStatus === 'sent') {
    const at = row.surveySentAt;
    items.push({
      label: 'Survey',
      detail: at ? `inviata ${formatDayMonth(new Date(at))}, in attesa di risposta` : 'inviata',
      done: true,
    });
  } else if (row.surveyStatus === 'skipped') {
    items.push({ label: 'Survey', detail: 'saltata', done: false });
  } else {
    const surveyDate = new Date(checkin);
    surveyDate.setDate(surveyDate.getDate() - 7);
    items.push({
      label: 'Survey',
      detail:
        surveyDate.getTime() < now.getTime()
          ? 'in coda al prossimo giro (09:00)'
          : `prevista ${formatDayMonth(surveyDate)} ore 09:00`,
      done: false,
    });
  }

  // Mid-stay: esiste solo se lo scheduler ha prenotato lo slot. Il
  // consenso e' il gate (contenuto commerciale), quindi senza slot
  // diciamo esattamente questo invece di inventare un orario.
  const midstay = bySendTrigger.get('midstay');
  if (midstay) {
    items.push({
      label: 'Mid-stay',
      detail:
        midstay.status === 'sent'
          ? `inviato${midstay.sentAt ? ` ${formatDayMonth(new Date(midstay.sentAt))}` : ''}${midstay.dryRun ? ' (simulato)' : ''}`
          : midstay.status === 'skipped'
            ? 'saltato'
            : midstay.status === 'failed'
              ? 'invio fallito — da sbloccare'
              : 'in coda',
      done: midstay.status === 'sent',
    });
  } else {
    items.push({ label: 'Mid-stay', detail: "a metà soggiorno, se c'è consenso", done: false });
  }

  return items;
}

// ─── Timeline in UNA riga (punto 5) ────────────────────────────────

/**
 * Il prossimo passo dell'agente in linguaggio host: "Benvenuto sabato
 * alle 08:00", "Benvenuto da sbloccare", "Survey inviata, aspetto la
 * risposta", "Tutto inviato". Una frase sola — il resto sta nel
 * dettaglio espandibile.
 */
export function nextStepLine(
  row: UpcomingCheckinCardData,
  welcomeTimeSlot: string,
  now: Date,
): string {
  const bySendTrigger = new Map(row.outbound.map((o) => [o.trigger, o]));
  const welcomeSend = bySendTrigger.get('welcome');
  const welcomeDone = Boolean(row.welcomeSentAt) || welcomeSend?.status === 'sent';

  if (!welcomeDone) {
    if (welcomeSend?.status === 'failed') return 'Benvenuto da sbloccare';
    const checkin = new Date(row.checkinAt);
    const [slotHours, slotMinutes] = welcomeTimeSlot.split(':').map(Number);
    const expectedAt = new Date(checkin);
    expectedAt.setHours(slotHours ?? 8, slotMinutes ?? 0, 0, 0);
    if (expectedAt.getTime() < now.getTime()) return 'Benvenuto non inviato';
    return `Benvenuto ${dayPhrase(row.checkinAt, now)} alle ${welcomeTimeSlot}`;
  }

  if (row.surveyStatus === 'sent') return 'Survey inviata, aspetto la risposta';
  if (row.surveyStatus === 'not_yet') {
    const surveyDate = new Date(row.checkinAt);
    surveyDate.setDate(surveyDate.getDate() - 7);
    return surveyDate.getTime() < now.getTime()
      ? 'Survey in coda (giro delle 09:00)'
      : `Survey ${dayPhrase(surveyDate.toISOString(), now)}`;
  }

  const midstay = bySendTrigger.get('midstay');
  if (midstay && midstay.status !== 'sent' && midstay.status !== 'skipped') {
    return midstay.status === 'failed' ? 'Mid-stay da sbloccare' : 'Mid-stay in coda';
  }

  return 'Tutto inviato';
}

// ─── Board ─────────────────────────────────────────────────────────

type RowState = {
  draft: string;
  error: string | null;
  flashSuccess: boolean;
};

const PLATFORM_LABELS: Record<UpcomingCheckinCardData['platform'], string> = {
  booking: 'Booking',
  airbnb: 'Airbnb',
  direct: 'Diretta',
};

function reasonToMessage(reason: SetPhoneActionResult & { ok: false }): string {
  switch (reason.reason) {
    case 'invalid_phone':
      return 'Numero non valido';
    case 'not_found':
      return 'Prenotazione non trovata';
    case 'wrong_host':
      return 'Permesso negato';
    default:
      return 'Errore inatteso';
  }
}

function defaultState(): RowState {
  return { draft: '', error: null, flashSuccess: false };
}

const PROPERTY_FILTER_STORAGE_KEY = 'premura.checkins.propertyFilter';

export function UpcomingCheckinsBoard({
  rows,
  properties,
  welcomeTimeSlot,
}: BoardProps): React.JSX.Element {
  const [pending, startTransition] = useTransition();
  // Filtro struttura persistente fra le visite (richiesta 30/07). Letto
  // da localStorage DOPO il mount — inizializzarlo nel primo render
  // creerebbe un mismatch di hydration col markup server ('all').
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  useEffect(() => {
    const saved = window.localStorage.getItem(PROPERTY_FILTER_STORAGE_KEY);
    if (saved && (saved === 'all' || properties.some((p) => p.id === saved))) {
      setPropertyFilter(saved);
    }
  }, [properties]);
  const changePropertyFilter = (value: string): void => {
    setPropertyFilter(value);
    window.localStorage.setItem(PROPERTY_FILTER_STORAGE_KEY, value);
  };

  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      rows.map((r) => [r.id, { draft: r.guestPhone ?? '', error: null, flashSuccess: false }]),
    ),
  );
  // Un solo campo numero espanso alla volta (punto 3): la prima riga
  // senza numero parte aperta, le altre si aprono col "+".
  const [expandedPhoneRow, setExpandedPhoneRow] = useState<string | null>(null);
  const [openMenuRow, setOpenMenuRow] = useState<string | null>(null);
  // now calcolato una volta al mount: le etichette relative ("arriva
  // domani") non devono cambiare sotto gli occhi durante la sessione.
  const [now] = useState(() => new Date());

  const updateRow = (id: string, patch: Partial<RowState>): void => {
    setState((s) => ({ ...s, [id]: { ...(s[id] ?? defaultState()), ...patch } }));
  };

  // Gruppi per urgenza (punto 1). Le fasce "occupato sorgente ignota"
  // restano separate alla radice: mai nei gruppi, mai nei conteggi.
  const { needsPhone, handled, excluded, occupied } = useMemo(() => {
    const visible =
      propertyFilter === 'all' ? rows : rows.filter((r) => r.propertyId === propertyFilter);
    const real = visible.filter((r) => !r.unknownOccupied);
    return {
      needsPhone: real.filter((r) => r.premuraState === 'missing_phone'),
      handled: real.filter((r) => r.premuraState === 'active'),
      excluded: real.filter((r) => r.premuraState === 'excluded'),
      occupied: visible.filter((r) => r.unknownOccupied),
    };
  }, [rows, propertyFilter]);

  // La prima riga senza numero parte col campo aperto.
  useEffect(() => {
    setExpandedPhoneRow((current) => {
      if (current && needsPhone.some((r) => r.id === current)) return current;
      return needsPhone[0]?.id ?? null;
    });
  }, [needsPhone]);

  const handleSave = (id: string, currentPhone: string | null): void => {
    const rowState = state[id];
    if (!rowState) return;
    const trimmed = rowState.draft.trim();
    if (trimmed.length === 0 || trimmed === (currentPhone ?? '')) {
      updateRow(id, { error: null });
      if (id !== needsPhone[0]?.id) setExpandedPhoneRow(needsPhone[0]?.id ?? null);
      return;
    }
    updateRow(id, { error: null });
    startTransition(async () => {
      try {
        const result = await setBookingGuestPhoneAction(id, trimmed);
        if (!result.ok) {
          updateRow(id, { error: reasonToMessage(result) });
          return;
        }
        updateRow(id, { flashSuccess: true });
        setTimeout(() => updateRow(id, { flashSuccess: false }), 1500);
      } catch (err) {
        updateRow(id, { error: err instanceof Error ? err.message : 'Errore di rete' });
      }
    });
  };

  const handleClear = (id: string): void => {
    if (!window.confirm('Rimuovere il numero da questa prenotazione?')) return;
    startTransition(async () => {
      try {
        const result = await clearBookingGuestPhoneAction(id);
        if (!result.ok) {
          updateRow(id, { error: 'Rimozione fallita' });
          return;
        }
        updateRow(id, { draft: '', error: null });
      } catch (err) {
        updateRow(id, { error: err instanceof Error ? err.message : 'Errore di rete' });
      }
    });
  };

  const handleToggleActive = (id: string, nextActive: boolean): void => {
    startTransition(async () => {
      try {
        const result = await setBookingPremuraActiveAction(id, nextActive);
        if (!result.ok) {
          updateRow(id, {
            error: result.reason === 'no_phone' ? 'Serve prima un numero' : 'Operazione fallita',
          });
        }
      } catch (err) {
        updateRow(id, { error: err instanceof Error ? err.message : 'Errore di rete' });
      }
    });
  };

  const totalVisible = needsPhone.length + handled.length + excluded.length;

  // ── Pezzi di riga condivisi ──────────────────────────────────────

  const rowHeader = (r: UpcomingCheckinCardData, menu: React.ReactNode): React.JSX.Element => (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-body text-ink">
          {r.guestFirstName ?? r.guestFullName}
        </p>
        <p className="truncate text-[12px] text-ink-mute">
          <span
            className="font-medium"
            style={{ color: propertyColorOrFallback(r.propertyColor, r.propertyName) }}
          >
            {r.propertyName}
          </span>{' '}
          · {PLATFORM_LABELS[r.platform]} · {formatDayMonth(new Date(r.checkinAt))} –{' '}
          {formatDayMonth(new Date(r.checkoutAt))}
        </p>
        <p className="mt-0.5 text-body-sm text-ink-soft">{statePhrase(r, now)}</p>
      </div>
      {menu}
    </div>
  );

  const rowMenu = (
    r: UpcomingCheckinCardData,
    items: Array<{ label: string; onClick: () => void }>,
  ): React.JSX.Element => (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={`Azioni per ${r.guestFullName}`}
        aria-expanded={openMenuRow === r.id}
        onClick={() => setOpenMenuRow(openMenuRow === r.id ? null : r.id)}
        className="rounded-full px-2 py-0.5 text-[18px] leading-none text-ink-mute hover:bg-line-soft hover:text-ink"
      >
        ⋯
      </button>
      {openMenuRow === r.id ? (
        <div className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-card border border-line bg-paper py-1 shadow-md">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={pending}
              onClick={() => {
                setOpenMenuRow(null);
                item.onClick();
              }}
              className="block w-full px-3 py-1.5 text-left text-body-sm text-ink hover:bg-ivory"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  const phoneError = (id: string): React.JSX.Element | null => {
    const s = state[id];
    return s?.error ? <p className="mt-1 text-body-sm text-alert">{s.error}</p> : null;
  };

  return (
    <div>
      {/* Filtro struttura */}
      <div className="mb-5 flex items-center gap-3">
        <label htmlFor="property-filter" className="text-body-sm font-medium text-ink-soft">
          Struttura
        </label>
        <select
          id="property-filter"
          value={propertyFilter}
          onChange={(e) => changePropertyFilter(e.target.value)}
          className="h-10 rounded-card-sm border border-line bg-paper px-3 text-body text-ink focus:outline-none focus:ring-2 focus:ring-terracotta-soft/40"
        >
          <option value="all">Tutte le strutture</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {totalVisible === 0 && occupied.length === 0 ? (
        <div className="rounded-card border border-line-soft bg-paper px-6 py-8 text-center text-body text-ink-soft shadow-sm">
          Nessuna prenotazione per questa struttura nella finestra dei 14 giorni.
        </div>
      ) : null}

      <div className="space-y-8">
        {/* SERVE IL TUO NUMERO */}
        {needsPhone.length > 0 ? (
          <section aria-label="Serve il tuo numero">
            <h2 className="mb-2 text-eyebrow uppercase tracking-wider text-gold-deep">
              Serve il tuo numero · {needsPhone.length}
            </h2>
            <div className="overflow-visible rounded-card border border-line bg-paper shadow-sm">
              {needsPhone.map((r) => {
                const s = state[r.id] ?? defaultState();
                const expanded = expandedPhoneRow === r.id;
                return (
                  <div key={r.id} className="border-t border-line-soft px-4 py-3 first:border-t-0">
                    {rowHeader(r, null)}
                    {expanded ? (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          defaultValue={s.draft}
                          placeholder="Numero WhatsApp dell'ospite"
                          disabled={pending}
                          aria-label={`Numero WhatsApp ospite ${r.guestFullName}`}
                          aria-invalid={s.error ? true : undefined}
                          className={`h-9 w-full max-w-64 rounded-card-sm border bg-paper px-2.5 text-body text-ink focus:outline-none focus:ring-2 focus:ring-terracotta-soft/40 ${s.error ? 'border-alert' : 'border-line'}`}
                          onChange={(e) => updateRow(r.id, { draft: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSave(r.id, r.guestPhone);
                            }
                          }}
                          onBlur={() => handleSave(r.id, r.guestPhone)}
                        />
                        {pending ? (
                          <Loader2 aria-hidden className="size-4 animate-spin text-ink-mute" />
                        ) : null}
                        {s.flashSuccess ? <Check aria-hidden className="size-4 text-ok" /> : null}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setExpandedPhoneRow(r.id)}
                        className="mt-1.5 text-body-sm font-medium text-terracotta-2 underline-offset-2 hover:underline"
                      >
                        + Aggiungi numero
                      </button>
                    )}
                    {phoneError(r.id)}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* PREMURA SE NE OCCUPA */}
        {handled.length > 0 ? (
          <section aria-label="Premura se ne occupa">
            <h2 className="mb-2 text-eyebrow uppercase tracking-wider text-ok">
              Premura se ne occupa · {handled.length}
            </h2>
            <div className="overflow-visible rounded-card border border-line bg-paper shadow-sm">
              {handled.map((r) => {
                const s = state[r.id] ?? defaultState();
                const items = buildTimeline(r, welcomeTimeSlot, now);
                return (
                  <div key={r.id} className="border-t border-line-soft px-4 py-3 first:border-t-0">
                    {rowHeader(
                      r,
                      rowMenu(r, [
                        {
                          label: 'Escludi da Premura',
                          onClick: () => handleToggleActive(r.id, false),
                        },
                        { label: 'Rimuovi numero', onClick: () => handleClear(r.id) },
                      ]),
                    )}
                    {/* Timeline in una riga; il dettaglio si apre al tap. */}
                    <details className="mt-1.5">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] text-ink-mute [&::-webkit-details-marker]:hidden">
                        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-ok" />
                        <span className="text-ink-soft">{nextStepLine(r, welcomeTimeSlot, now)}</span>
                        {r.guestPhone ? (
                          <span className="font-mono text-ink-mute">{r.guestPhone}</span>
                        ) : null}
                        {s.flashSuccess ? <Check aria-hidden className="size-3.5 text-ok" /> : null}
                      </summary>
                      <ul className="mt-2 space-y-1 border-t border-dashed border-line-soft pt-2 text-[12px] text-ink-mute">
                        {items.map((it) => (
                          <li key={it.label} className="flex items-center gap-1.5">
                            <span
                              aria-hidden
                              className={`size-1.5 rounded-full ${it.done ? 'bg-ok' : 'bg-line'}`}
                            />
                            <span className={it.done ? 'text-ink-soft' : undefined}>
                              <span className="font-medium">{it.label}</span> · {it.detail}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                    {phoneError(r.id)}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* HAI ESCLUSO TU */}
        {excluded.length > 0 ? (
          <section aria-label="Hai escluso tu">
            <h2 className="mb-2 text-eyebrow uppercase tracking-wider text-ink-mute">
              Hai escluso tu · {excluded.length}
            </h2>
            <div className="overflow-visible rounded-card border border-line bg-paper shadow-sm">
              {excluded.map((r) => (
                <div key={r.id} className="border-t border-line-soft px-4 py-3 first:border-t-0">
                  {rowHeader(
                    r,
                    rowMenu(r, [
                      { label: 'Riattiva Premura', onClick: () => handleToggleActive(r.id, true) },
                      { label: 'Rimuovi numero', onClick: () => handleClear(r.id) },
                    ]),
                  )}
                  {phoneError(r.id)}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {/* Fasce "occupato — sorgente ignota": il feed iCal Booking dice
          solo che le date sono prese, non chi arriva. Sezione condivisa
          con la home (gruppi per urgenza, chip struttura, date complete);
          qui e' informativa — il completamento sta sulla home. */}
      {occupied.length > 0 ? (
        <section aria-label="Date occupate" className="mt-10">
          <h2 className="mb-1 font-serif text-h3 leading-tight text-ink">Date occupate</h2>
          <p className="mb-3 text-body-sm text-ink-mute">
            Il calendario Booking dice solo che queste date sono occupate — verifica chi arriva
            sull'extranet.
          </p>
          <OccupiedRangesSection
            ranges={occupied.map((r) => ({
              id: r.id,
              propertyId: r.propertyId,
              propertyName: r.propertyName,
              propertyColor: r.propertyColor,
              checkinAtIso: r.checkinAt,
              checkoutAtIso: r.checkoutAt,
            }))}
            properties={properties}
          />
        </section>
      ) : null}
    </div>
  );
}
