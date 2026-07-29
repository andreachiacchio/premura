'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createCleanerAction, updateCleanerAction } from '../actions';

export type CleanerFormInitial = {
  fullName: string;
  whatsappNumber: string;
  email: string;
  deliveryAddress: string;
  pickupPointCode: string;
  perKitFeeEur: string;
  payoutMethod: 'cash' | 'stripe_connect';
  payoutIban: string;
  languagePreferred: 'it' | 'en' | 'es';
  notes: string;
};

const EMPTY: CleanerFormInitial = {
  fullName: '',
  whatsappNumber: '',
  email: '',
  deliveryAddress: '',
  pickupPointCode: '',
  perKitFeeEur: '2.00',
  payoutMethod: 'cash',
  payoutIban: '',
  languagePreferred: 'it',
  notes: '',
};

export function CleanerForm({
  cleanerId,
  initial,
}: {
  cleanerId?: string;
  initial?: Partial<CleanerFormInitial>;
}): React.JSX.Element {
  const router = useRouter();
  const [form, setForm] = useState<CleanerFormInitial>({ ...EMPTY, ...initial });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof CleanerFormInitial>(field: K, value: CleanerFormInitial[K]): void {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);

    if (!form.fullName.trim()) return setError('Il nome completo è richiesto.');
    if (!form.whatsappNumber.trim()) return setError('Il numero WhatsApp è richiesto.');
    if (!form.deliveryAddress.trim()) return setError("L'indirizzo di consegna è richiesto.");

    startTransition(async () => {
      const payload = {
        fullName: form.fullName.trim(),
        whatsappNumber: form.whatsappNumber.trim(),
        email: form.email.trim() || undefined,
        deliveryAddress: form.deliveryAddress.trim(),
        pickupPointCode: form.pickupPointCode.trim() || undefined,
        perKitFeeEur: form.perKitFeeEur || undefined,
        payoutMethod: form.payoutMethod,
        payoutIban: form.payoutIban.trim() || undefined,
        languagePreferred: form.languagePreferred,
        notes: form.notes.trim() || undefined,
      };
      try {
        if (cleanerId) {
          const r = await updateCleanerAction(cleanerId, payload);
          if (!r.ok) {
            setError(`Aggiornamento fallito: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
            return;
          }
          router.push(`/dashboard/cleaners/${cleanerId}`);
        } else {
          const r = await createCleanerAction(payload);
          if (!r.ok) {
            setError(`Creazione fallita: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
            return;
          }
          router.push(`/dashboard/cleaners/${r.cleanerId}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Errore inatteso.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-md border border-terracotta-2/40 bg-peach px-3 py-2 text-sm text-terracotta-2">
          {error}
        </div>
      )}

      <Field label="Nome completo" required>
        <input
          value={form.fullName}
          onChange={(e) => set('fullName', e.target.value)}
          className={inputCls}
          placeholder="Karen Esposito"
          autoComplete="off"
        />
      </Field>

      <Field label="Numero WhatsApp" required hint="Formato internazionale, es. +39 333 1234567">
        <input
          value={form.whatsappNumber}
          onChange={(e) => set('whatsappNumber', e.target.value)}
          className={inputCls}
          placeholder="+39 333 1234567"
          inputMode="tel"
          autoComplete="off"
        />
      </Field>

      <Field label="Email" hint="Opzionale, per magic link app cleaner.">
        <input
          type="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          className={inputCls}
          placeholder="karen@example.com"
          autoComplete="off"
        />
      </Field>

      <Field label="Indirizzo di consegna" required hint="Per Amazon Locker / Glovo a casa.">
        <textarea
          value={form.deliveryAddress}
          onChange={(e) => set('deliveryAddress', e.target.value)}
          className={inputCls}
          rows={2}
          placeholder="Via Roma 12, 80100 Napoli"
        />
      </Field>

      <Field label="Punto ritiro convenzionato" hint="Opzionale (codice locker, edicola, ecc.).">
        <input
          value={form.pickupPointCode}
          onChange={(e) => set('pickupPointCode', e.target.value)}
          className={inputCls}
          placeholder="LOCKER-NAP-12 (opzionale)"
        />
      </Field>

      <Field label="Fee per kit (€)" hint="Default €2.00 per kit validato.">
        <input
          type="number"
          step="0.50"
          min="0"
          max="50"
          value={form.perKitFeeEur}
          onChange={(e) => set('perKitFeeEur', e.target.value)}
          className={inputCls}
        />
      </Field>

      <Field label="Metodo pagamento">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="payoutMethod"
              checked={form.payoutMethod === 'cash'}
              onChange={() => set('payoutMethod', 'cash')}
            />
            Cash
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="payoutMethod"
              checked={form.payoutMethod === 'stripe_connect'}
              onChange={() => set('payoutMethod', 'stripe_connect')}
            />
            Stripe Connect
          </label>
        </div>
      </Field>

      {form.payoutMethod === 'stripe_connect' && (
        <Field label="IBAN" hint="Opzionale, da configurare in Stripe Connect.">
          <input
            value={form.payoutIban}
            onChange={(e) => set('payoutIban', e.target.value)}
            className={inputCls}
            placeholder="IT60 X054 2811 1010 0000 0123 456"
          />
        </Field>
      )}

      <Field label="Lingua preferita">
        <select
          value={form.languagePreferred}
          onChange={(e) =>
            set('languagePreferred', e.target.value as CleanerFormInitial['languagePreferred'])
          }
          className={inputCls}
        >
          <option value="it">Italiano</option>
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </Field>

      <Field label="Note" hint="Note libere per te.">
        <textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          className={inputCls}
          rows={3}
          placeholder="Es. preferisce ritirare la mattina presto…"
        />
      </Field>

      <div className="flex gap-3 border-t border-line pt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-terracotta px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-terracotta-2 disabled:opacity-60"
        >
          {pending ? 'Salvataggio…' : cleanerId ? 'Salva modifiche' : 'Crea cleaner'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-line bg-white px-4 py-2 text-sm text-ink-mute hover:text-ink"
        >
          Annulla
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink">
        {label}
        {required ? ' *' : ''}
      </span>
      {hint && <span className="block text-xs text-ink-mute">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  'w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta';
