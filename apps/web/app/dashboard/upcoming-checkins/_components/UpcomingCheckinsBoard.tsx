'use client';

import { Check, Loader2, Pause, Play, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  type SetPhoneActionResult,
  clearBookingGuestPhoneAction,
  setBookingGuestPhoneAction,
  setBookingPremuraActiveAction,
} from '../actions';

// Board "prossimi check-in" — ristrutturazione richiesta da Andrea:
//  1. filtro struttura in alto (select), righe raggruppate per struttura
//  2. numero WhatsApp sempre modificabile inline, anche se gia' inserito
//  3. tre stati: Attivo (verde) / Manca numero (ambra) / Escluso (grigio),
//     con toggle Escluso<->Attivo dalla riga
//  4. colonna arrivo relativa ("fra 3 giorni", "oggi", "in corso")
//  5. desktop a larghezza piena; su mobile le righe diventano schede
//  6. sotto ogni riga attiva la timeline invii (benvenuto/survey/mid-stay)

// Regola condivisa (lib/format-date): anno solo quando non e' il corrente.
import { formatDayMonth } from '@/lib/format-date';

const TIME_FMT = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });

export type SurveyStatusUI = 'not_yet' | 'sent' | 'completed' | 'skipped';
export type PremuraStateUI = 'active' | 'missing_phone' | 'excluded';

export type OutboundEntryUI = {
  trigger: 'welcome' | 'midstay' | 'checkout';
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
  properties: Array<{ id: string; name: string }>;
  /** hosts.welcome_time_slot, es. '08:00' — orario previsto del benvenuto. */
  welcomeTimeSlot: string;
};

// ─── Arrivo relativo ───────────────────────────────────────────────

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

// ─── Stato Premura ─────────────────────────────────────────────────

const STATE_META: Record<PremuraStateUI, { label: string; cls: string; dot: string }> = {
  active: { label: 'Attivo', cls: 'bg-line-soft text-ok border border-ok/20', dot: 'bg-ok' },
  missing_phone: {
    label: 'Manca numero',
    cls: 'bg-gold-soft text-gold-deep',
    dot: 'bg-gold-deep',
  },
  excluded: { label: 'Escluso', cls: 'bg-line-soft text-ink-mute', dot: 'bg-ink-mute' },
};

function StateBadge({ state }: { state: PremuraStateUI }): React.JSX.Element {
  const meta = STATE_META[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

// ─── Timeline invii ────────────────────────────────────────────────

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

function TimelineRow({ items }: { items: TimelineItem[] }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-mute">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={`size-1.5 rounded-full ${it.done ? 'bg-ok' : 'bg-line'}`} />
          <span className={it.done ? 'text-ink-soft' : undefined}>
            <span className="font-medium">{it.label}</span> · {it.detail}
          </span>
        </span>
      ))}
    </div>
  );
}

// ─── Board ─────────────────────────────────────────────────────────

type RowState = {
  draft: string;
  editing: boolean;
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
  return { draft: '', editing: false, error: null, flashSuccess: false };
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
      rows.map((r) => [
        r.id,
        { draft: r.guestPhone ?? '', editing: false, error: null, flashSuccess: false },
      ]),
    ),
  );
  // now calcolato una volta al mount: le etichette relative ("fra 3
  // giorni") non devono cambiare sotto gli occhi durante la sessione.
  const [now] = useState(() => new Date());

  const updateRow = (id: string, patch: Partial<RowState>): void => {
    setState((s) => ({ ...s, [id]: { ...(s[id] ?? defaultState()), ...patch } }));
  };

  // Prenotazioni vere e fasce "occupato sorgente ignota" separate alla
  // radice: mai nello stesso gruppo, mai negli stessi conteggi.
  const { groups, occupiedGroups } = useMemo(() => {
    const visible =
      propertyFilter === 'all' ? rows : rows.filter((r) => r.propertyId === propertyFilter);
    const byProperty = new Map<string, UpcomingCheckinCardData[]>();
    const occupiedByProperty = new Map<string, UpcomingCheckinCardData[]>();
    for (const r of visible) {
      const target = r.unknownOccupied ? occupiedByProperty : byProperty;
      const list = target.get(r.propertyId) ?? [];
      list.push(r);
      target.set(r.propertyId, list);
    }
    // Ordine gruppi = ordine alfabetico delle property (stesso del select),
    // limitato a quelle che hanno righe visibili.
    return {
      groups: properties
        .filter((p) => byProperty.has(p.id))
        .map((p) => ({ property: p, rows: byProperty.get(p.id) ?? [] })),
      occupiedGroups: properties
        .filter((p) => occupiedByProperty.has(p.id))
        .map((p) => ({ property: p, rows: occupiedByProperty.get(p.id) ?? [] })),
    };
  }, [rows, properties, propertyFilter]);

  const handleSave = (id: string, currentPhone: string | null): void => {
    const rowState = state[id];
    if (!rowState) return;
    const trimmed = rowState.draft.trim();
    if (trimmed.length === 0 || trimmed === (currentPhone ?? '')) {
      updateRow(id, { editing: false, error: null });
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
        updateRow(id, { editing: false, flashSuccess: true });
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
        updateRow(id, { draft: '', editing: false, error: null });
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

      {groups.length === 0 && occupiedGroups.length === 0 ? (
        <div className="rounded-card border border-line-soft bg-paper px-6 py-8 text-center text-body text-ink-soft shadow-sm">
          Nessuna prenotazione per questa struttura nella finestra dei 14 giorni.
        </div>
      ) : null}

      <div className="space-y-8">
        {groups.map(({ property, rows: groupRows }) => (
          <section key={property.id} aria-label={property.name}>
            <h2 className="mb-3 flex items-baseline gap-2 font-serif text-h3 leading-tight text-ink">
              {property.name}
              <span className="text-body-sm font-sans text-ink-mute">
                {groupRows.length} {groupRows.length === 1 ? 'prenotazione' : 'prenotazioni'}
              </span>
            </h2>

            <div className="overflow-hidden rounded-card border border-line bg-paper shadow-sm">
              {/* Intestazione visibile solo su desktop */}
              <div className="hidden border-b border-line-soft bg-ivory px-4 py-2.5 text-eyebrow uppercase tracking-wider text-ink-mute lg:grid lg:grid-cols-[minmax(10rem,1.3fr)_minmax(8rem,1fr)_minmax(6rem,0.7fr)_minmax(13rem,1.3fr)_minmax(9rem,0.9fr)_auto] lg:gap-4">
                <span>Ospite</span>
                <span>Date</span>
                <span>Arrivo</span>
                <span>Numero WhatsApp</span>
                <span>Stato</span>
                <span className="sr-only">Azioni</span>
              </div>

              {groupRows.map((r) => {
                const s = state[r.id] ?? defaultState();
                const arrival = arrivalLabel(r.checkinAt, r.checkoutAt, now);
                const dateRange = `${formatDayMonth(new Date(r.checkinAt))} – ${formatDayMonth(new Date(r.checkoutAt))}`;
                // Lo stato mostrato reagisce subito al salvataggio del
                // numero (flashSuccess) senza aspettare la revalidate.
                const shownState: PremuraStateUI =
                  r.premuraState === 'missing_phone' && s.flashSuccess ? 'active' : r.premuraState;

                return (
                  <div key={r.id} className="border-t border-line-soft first:border-t-0">
                    <div className="grid grid-cols-1 gap-2 px-4 py-3 lg:grid-cols-[minmax(10rem,1.3fr)_minmax(8rem,1fr)_minmax(6rem,0.7fr)_minmax(13rem,1.3fr)_minmax(9rem,0.9fr)_auto] lg:items-center lg:gap-4">
                      {/* Ospite */}
                      <div className="flex items-baseline justify-between gap-2 lg:block">
                        <p className="font-medium text-body text-ink">
                          {r.guestFirstName ?? r.guestFullName}
                        </p>
                        <p className="text-[12px] text-ink-mute">
                          {r.numGuests} {r.numGuests === 1 ? 'ospite' : 'ospiti'} ·{' '}
                          {PLATFORM_LABELS[r.platform]}
                        </p>
                      </div>

                      {/* Date */}
                      <p className="text-body-sm text-ink-soft lg:whitespace-nowrap">{dateRange}</p>

                      {/* Arrivo relativo */}
                      <p
                        className={`text-body-sm lg:whitespace-nowrap ${
                          arrival === 'oggi' || arrival === 'in corso'
                            ? 'font-medium text-terracotta-2'
                            : 'text-ink-soft'
                        }`}
                      >
                        {arrival}
                      </p>

                      {/* Numero — sempre editabile */}
                      <div>
                        {s.editing || !r.guestPhone ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="tel"
                              inputMode="tel"
                              autoComplete="tel"
                              defaultValue={s.draft}
                              placeholder="+39 333 1234567"
                              disabled={pending}
                              aria-label={`Numero WhatsApp ospite ${r.guestFullName}`}
                              aria-invalid={s.error ? true : undefined}
                              className={`h-9 w-full max-w-52 rounded-card-sm border bg-paper px-2.5 text-body text-ink focus:outline-none focus:ring-2 focus:ring-terracotta-soft/40 ${s.error ? 'border-alert' : 'border-line'}`}
                              onChange={(e) => updateRow(r.id, { draft: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSave(r.id, r.guestPhone);
                                }
                                if (e.key === 'Escape') {
                                  updateRow(r.id, {
                                    editing: false,
                                    draft: r.guestPhone ?? '',
                                    error: null,
                                  });
                                }
                              }}
                              onBlur={() => handleSave(r.id, r.guestPhone)}
                            />
                            {pending && s.editing ? (
                              <Loader2 aria-hidden className="size-4 animate-spin text-ink-mute" />
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                updateRow(r.id, { editing: true, draft: r.guestPhone ?? '' })
                              }
                              title="Modifica numero"
                              className="rounded-card-sm bg-line-soft px-2.5 py-1 font-mono text-body-sm text-ink hover:bg-line"
                            >
                              {r.guestPhone}
                            </button>
                            {s.flashSuccess ? (
                              <Check aria-hidden className="size-4 text-ok" />
                            ) : null}
                            <button
                              type="button"
                              onClick={() => handleClear(r.id)}
                              disabled={pending}
                              aria-label={`Rimuovi numero ${r.guestFullName}`}
                              className="rounded-full p-1 text-ink-mute hover:bg-line-soft hover:text-ink-soft"
                            >
                              <Trash2 aria-hidden className="size-3.5" />
                            </button>
                          </div>
                        )}
                        {s.error ? <p className="mt-1 text-body-sm text-alert">{s.error}</p> : null}
                      </div>

                      {/* Stato */}
                      <div>
                        <StateBadge state={shownState} />
                      </div>

                      {/* Toggle Escluso <-> Attivo */}
                      <div className="flex items-center gap-2 lg:justify-end">
                        {shownState === 'active' ? (
                          <button
                            type="button"
                            onClick={() => handleToggleActive(r.id, false)}
                            disabled={pending}
                            title="Escludi: l'agente non contattera' questo ospite"
                            className="inline-flex items-center gap-1.5 rounded-card-sm border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-soft hover:bg-line-soft"
                          >
                            <Pause aria-hidden className="size-3.5" />
                            Escludi
                          </button>
                        ) : null}
                        {shownState === 'excluded' ? (
                          <button
                            type="button"
                            onClick={() => handleToggleActive(r.id, true)}
                            disabled={pending}
                            title="Riattiva: l'agente riprende a gestire questo ospite"
                            className="inline-flex items-center gap-1.5 rounded-card-sm border border-ok/30 px-2.5 py-1.5 text-[12px] font-medium text-ok hover:bg-line-soft"
                          >
                            <Play aria-hidden className="size-3.5" />
                            Attiva
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Timeline invii — solo per righe attive */}
                    {shownState === 'active' ? (
                      <div className="border-t border-dashed border-line-soft bg-ivory/60 px-4 py-2">
                        <TimelineRow items={buildTimeline(r, welcomeTimeSlot, now)} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Fasce "occupato — sorgente ignota": il feed iCal Booking dice
          solo che le date sono prese, non chi arriva. Sezione propria,
          righe semplificate (niente numero, stato o timeline: senza
          ospite non c'e' nulla da attivare). */}
      {occupiedGroups.length > 0 ? (
        <section aria-label="Date occupate" className="mt-10">
          <h2 className="mb-1 font-serif text-h3 leading-tight text-ink">Date occupate</h2>
          <p className="mb-3 text-body-sm text-ink-mute">
            Il calendario Booking dice solo che queste date sono occupate — verifica chi arriva
            sull'extranet.
          </p>
          <div className="space-y-4">
            {occupiedGroups.map(({ property, rows: groupRows }) => (
              <div
                key={property.id}
                className="overflow-hidden rounded-card border border-line bg-paper shadow-sm"
              >
                <p className="border-b border-line-soft bg-ivory px-4 py-2 text-eyebrow uppercase tracking-wider text-ink-mute">
                  {property.name}
                </p>
                {groupRows.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-line-soft px-4 py-2.5 first:border-t-0"
                  >
                    <p className="text-body text-ink">
                      {formatDayMonth(new Date(r.checkinAt))} –{' '}
                      {formatDayMonth(new Date(r.checkoutAt))}
                    </p>
                    <p className="text-body-sm text-ink-soft">
                      {arrivalLabel(r.checkinAt, r.checkoutAt, now)}
                    </p>
                    <p className="text-[12px] text-ink-mute">da iCal Booking · ospite ignoto</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
