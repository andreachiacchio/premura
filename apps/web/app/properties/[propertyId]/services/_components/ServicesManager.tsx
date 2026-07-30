'use client';

import {
  CATEGORY_LABELS,
  SERVICE_CATEGORIES,
  type ServiceRow,
  serviceFormSchema,
} from '@/lib/services-form';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  createServiceAction,
  toggleServiceActiveAction,
  updateServiceAction,
} from '../actions';

// Gestione servizi della struttura (30/07): lista + form inline.
// Nessuna libreria form: campi controllati + zod al submit — il form
// e' piccolo e la validazione vera sta comunque nella server action.

type FormState = {
  titleEn: string;
  titleIt: string;
  category: string;
  descriptionEn: string;
  descriptionIt: string;
  photoUrl: string;
  salePriceEur: string;
  priceOnRequest: boolean;
  providerId: string;
};

function emptyForm(): FormState {
  return {
    titleEn: '',
    titleIt: '',
    category: 'other',
    descriptionEn: '',
    descriptionIt: '',
    photoUrl: '',
    salePriceEur: '',
    priceOnRequest: false,
    providerId: '',
  };
}

function formFromService(s: ServiceRow): FormState {
  return {
    titleEn: s.titleEn,
    titleIt: s.titleIt ?? '',
    category: s.category,
    descriptionEn: s.descriptionEn ?? '',
    descriptionIt: s.descriptionIt ?? '',
    photoUrl: s.photoUrl ?? '',
    salePriceEur: s.salePriceEur ?? '',
    priceOnRequest: s.priceOnRequest,
    providerId: s.providerId ?? '',
  };
}

function priceLabel(s: ServiceRow): string {
  if (s.priceOnRequest) return 'su richiesta';
  if (!s.salePriceEur) return '—';
  const n = Number(s.salePriceEur);
  return `€${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

const INPUT_CLS =
  'h-10 w-full rounded-card border border-line bg-paper px-3 text-body text-ink focus:border-terracotta-soft focus:outline-none focus:ring-2 focus:ring-terracotta-soft/40';
const LABEL_CLS = 'text-body-sm font-medium text-ink-soft';

export function ServicesManager({
  propertyId,
  services,
  providers,
}: {
  propertyId: string;
  services: ServiceRow[];
  providers: Array<{ id: string; name: string }>;
}): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // null = form chiuso; 'new' = creazione; altrimenti id del servizio.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const openNew = (): void => {
    setForm(emptyForm());
    setEditing('new');
    setError(null);
  };
  const openEdit = (s: ServiceRow): void => {
    setForm(formFromService(s));
    setEditing(s.id);
    setError(null);
  };
  const close = (): void => {
    setEditing(null);
    setError(null);
  };

  const set = (patch: Partial<FormState>): void => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const parsed = serviceFormSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Controlla i campi');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result =
        editing === 'new'
          ? await createServiceAction(propertyId, parsed.data)
          : await updateServiceAction(editing ?? '', propertyId, parsed.data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  };

  const handleToggle = (s: ServiceRow): void => {
    startTransition(async () => {
      const result = await toggleServiceActiveAction(s.id, propertyId, !s.isActive);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  };

  const formPanel = (
    <form
      onSubmit={handleSubmit}
      className="mb-5 flex flex-col gap-3 rounded-card border border-line bg-paper p-4 shadow-sm"
    >
      <p className="font-serif text-h4 leading-tight text-ink">
        {editing === 'new' ? 'Nuovo servizio' : 'Modifica servizio'}
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLS}>Nome (inglese — lo vede l'ospite)</span>
          <input
            className={INPUT_CLS}
            value={form.titleEn}
            onChange={(e) => set({ titleEn: e.target.value })}
            placeholder="Es. Full-day boat tour"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLS}>Nome italiano (opzionale)</span>
          <input
            className={INPUT_CLS}
            value={form.titleIt}
            onChange={(e) => set({ titleIt: e.target.value })}
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLS}>Categoria</span>
          <select
            className={INPUT_CLS}
            value={form.category}
            onChange={(e) => set({ category: e.target.value })}
          >
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLS}>Fornitore collegato</span>
          <select
            className={INPUT_CLS}
            value={form.providerId}
            onChange={(e) => set({ providerId: e.target.value })}
          >
            <option value="">— nessuno —</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLS}>Prezzo (€)</span>
          <input
            className={INPUT_CLS}
            inputMode="decimal"
            value={form.salePriceEur}
            onChange={(e) => set({ salePriceEur: e.target.value })}
            placeholder="Es. 120"
            disabled={form.priceOnRequest}
          />
        </label>
        <label className="flex items-center gap-2 self-end pb-2.5">
          <input
            type="checkbox"
            checked={form.priceOnRequest}
            onChange={(e) => set({ priceOnRequest: e.target.checked })}
            className="size-4 accent-terracotta"
          />
          <span className={LABEL_CLS}>Prezzo su richiesta</span>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className={LABEL_CLS}>Descrizione (inglese)</span>
        <textarea
          className={`${INPUT_CLS} h-24 py-2`}
          value={form.descriptionEn}
          onChange={(e) => set({ descriptionEn: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL_CLS}>Descrizione italiana (opzionale)</span>
        <textarea
          className={`${INPUT_CLS} h-24 py-2`}
          value={form.descriptionIt}
          onChange={(e) => set({ descriptionIt: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL_CLS}>Foto (URL)</span>
        <input
          className={INPUT_CLS}
          value={form.photoUrl}
          onChange={(e) => set({ photoUrl: e.target.value })}
          placeholder="https://…"
        />
      </label>

      {error ? (
        <p role="alert" className="text-body-sm font-medium text-alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-full bg-terracotta px-5 text-body-sm font-medium text-paper shadow-md hover:bg-terracotta-2 disabled:opacity-60"
        >
          {pending ? 'Salvo…' : 'Salva servizio'}
        </button>
        <button
          type="button"
          onClick={close}
          className="text-body-sm font-medium text-ink-soft hover:text-ink"
        >
          Annulla
        </button>
      </div>
    </form>
  );

  return (
    <div>
      {editing === null ? (
        <button
          type="button"
          onClick={openNew}
          className="mb-5 inline-flex h-11 items-center justify-center rounded-full bg-terracotta px-6 text-body-sm font-medium text-paper shadow-md hover:bg-terracotta-2"
        >
          + Aggiungi servizio
        </button>
      ) : (
        formPanel
      )}

      {services.length === 0 && editing === null ? (
        <div className="rounded-card border border-line-soft bg-paper px-6 py-8 text-center text-body text-ink-soft shadow-sm">
          Nessun servizio ancora. Aggiungi il primo: è quello che l'ospite vedrà nella guest app.
        </div>
      ) : null}

      <ul className="flex flex-col gap-2.5">
        {services.map((s) => (
          <li
            key={s.id}
            className={`flex items-start gap-3 rounded-card border bg-paper p-3.5 shadow-sm ${s.isActive ? 'border-line' : 'border-line-soft opacity-60'}`}
          >
            {s.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={s.photoUrl}
                alt=""
                className="size-14 shrink-0 rounded-card-sm object-cover"
              />
            ) : (
              <div className="grid size-14 shrink-0 place-items-center rounded-card-sm bg-ivory-warm font-serif text-[18px] text-ink-mute">
                {s.titleEn.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <p className="truncate font-medium text-body text-ink">{s.titleIt ?? s.titleEn}</p>
                <span className="shrink-0 rounded-full bg-line-soft px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                  {CATEGORY_LABELS[s.category as keyof typeof CATEGORY_LABELS] ?? s.category}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-ink-mute">
                {priceLabel(s)}
                {s.providerName ? ` · fornitore: ${s.providerName}` : ' · nessun fornitore'}
                {s.isActive ? '' : ' · disattivato'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => openEdit(s)}
                className="text-body-sm font-medium text-terracotta-2 underline-offset-2 hover:underline"
              >
                Modifica
              </button>
              <button
                type="button"
                onClick={() => handleToggle(s)}
                disabled={pending}
                className="text-body-sm font-medium text-ink-mute underline-offset-2 hover:underline"
              >
                {s.isActive ? 'Disattiva' : 'Riattiva'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
