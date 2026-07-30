'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { BookingForDashboard } from '@/lib/types';
import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { buildGuestInviteAction } from '../actions';

// Form di completamento manuale prenotazioni Booking incomplete (M2a.4
// slice 5). 3 campi obbligatori (nome, telefono, lingua) + 1 opzionale
// (numero ospiti). Validazione zod allineata al body schema dell'API
// Fastify (apps/api/src/api/bookings.ts riga 31 sgg.) per evitare drift.

export const completeBookingFormSchema = z.object({
  guestFullName: z.string().trim().min(2, 'Il nome deve avere almeno 2 caratteri'),
  guestPhone: z.string().trim().min(8, 'Il telefono deve avere almeno 8 caratteri'),
  guestLanguage: z
    .string()
    .trim()
    .min(2, 'Codice lingua troppo corto')
    .max(8, 'Codice lingua troppo lungo'),
  numGuests: z.coerce
    .number()
    .int('Il numero ospiti deve essere intero')
    .min(1, 'Almeno 1 ospite')
    .max(20, 'Troppo')
    .optional(),
});

export type CompleteBookingFormValues = z.infer<typeof completeBookingFormSchema>;

// Tipi delle server action passate via prop. Le firme rispecchiano cio'
// che la sezione E implementera' in app/dashboard/actions.ts: la complete
// prende FormData (per supportare progressive enhancement nativo Next),
// la skip prende solo l'id.
export type CompleteBookingActionFn = (formData: FormData) => Promise<void>;
export type SkipBookingActionFn = (bookingId: string) => Promise<void>;

// Lingue del menu: quelle che un host italiano incontra davvero.
// I valori sono i codici salvati in guest_language.
const LANGUAGE_OPTIONS = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
] as const;

// Preselezione dalla nazionalita' (il feed la sa gia': Julian NO,
// Krzysztof PL). Paesi non coperti dalle 5 lingue -> English; nessuna
// nazionalita' -> Italiano.
const COUNTRY_TO_LANGUAGE: Record<string, string> = {
  IT: 'it',
  DE: 'de',
  AT: 'de',
  FR: 'fr',
  BE: 'fr',
  ES: 'es',
  MX: 'es',
  AR: 'es',
};

function defaultLanguageFor(countryCode: string | null): string {
  if (!countryCode) return 'it';
  return COUNTRY_TO_LANGUAGE[countryCode.toUpperCase()] ?? 'en';
}

export function CompleteBookingDialog({
  booking,
  open,
  onOpenChange,
  completeAction,
  skipAction,
}: {
  booking: BookingForDashboard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  completeAction: CompleteBookingActionFn;
  skipAction: SkipBookingActionFn;
}) {
  const form = useForm<CompleteBookingFormValues>({
    resolver: zodResolver(completeBookingFormSchema),
    defaultValues: {
      guestFullName: '',
      guestPhone: '',
      guestLanguage: defaultLanguageFor(booking.guestCountryCode),
      numGuests: undefined,
    },
  });

  const [submitting, setSubmitting] = React.useState(false);
  const [skipping, setSkipping] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  // L1: messaggio pronto per l'inbox Booking/Airbnb quando il numero
  // non c'e'. null = non ancora generato.
  const [inviteMessage, setInviteMessage] = React.useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = React.useState(false);
  const [inviteCopied, setInviteCopied] = React.useState(false);

  // Reset form quando il dialog si riapre per una booking diversa.
  React.useEffect(() => {
    if (open) {
      form.reset({
        guestFullName: '',
        guestPhone: '',
        guestLanguage: defaultLanguageFor(booking.guestCountryCode),
        numGuests: undefined,
      });
      setSubmitError(null);
      setInviteMessage(null);
      setInviteCopied(false);
    }
  }, [open, booking.id, booking.guestCountryCode, form]);

  async function onGenerateInvite() {
    setInviteLoading(true);
    setSubmitError(null);
    try {
      const result = await buildGuestInviteAction(booking.id);
      if (result.ok) {
        setInviteMessage(result.message);
      } else {
        setSubmitError(result.error);
      }
    } finally {
      setInviteLoading(false);
    }
  }

  async function onCopyInvite() {
    if (!inviteMessage) return;
    await navigator.clipboard.writeText(inviteMessage);
    setInviteCopied(true);
  }

  async function onSubmit(values: CompleteBookingFormValues) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const fd = new FormData();
      fd.set('bookingId', booking.id);
      fd.set('guestFullName', values.guestFullName);
      fd.set('guestPhone', values.guestPhone);
      fd.set('guestLanguage', values.guestLanguage);
      if (values.numGuests !== undefined) {
        fd.set('numGuests', String(values.numGuests));
      }
      await completeAction(fd);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Errore imprevisto, riprova.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onSkip() {
    setSkipping(true);
    setSubmitError(null);
    try {
      await skipAction(booking.id);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Errore imprevisto, riprova.');
    } finally {
      setSkipping(false);
    }
  }

  const dateLabel = new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
  }).format(booking.checkinAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Completa la prenotazione</DialogTitle>
          <DialogDescription>
            {booking.propertyName} · check-in {dateLabel}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="guestFullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome dell&apos;ospite</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome e cognome" autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="guestPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefono</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="+39 333 1234567" autoComplete="tel" {...field} />
                  </FormControl>
                  <FormDescription>WhatsApp se possibile, è il canale di Premura.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* L1: senza numero, il primo messaggio lo manda l'host
                nell'inbox della piattaforma — testo pronto da copiare. */}
            <div className="rounded-card border border-line-soft bg-ivory/60 px-3 py-2.5">
              {inviteMessage === null ? (
                <button
                  type="button"
                  onClick={onGenerateInvite}
                  disabled={inviteLoading}
                  className="text-body-sm font-medium text-terracotta-2 underline-offset-2 hover:underline disabled:opacity-60"
                >
                  {inviteLoading
                    ? 'Preparo il messaggio…'
                    : "Non ho il numero — manda il link all'ospite"}
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-[12px] text-ink-mute">
                    Incollalo nell'inbox Booking/Airbnb: l'ospite risponde col suo numero.
                  </p>
                  <textarea
                    readOnly
                    value={inviteMessage}
                    rows={6}
                    className="w-full rounded-card border border-line bg-paper px-3 py-2 text-[13px] text-ink"
                  />
                  <button
                    type="button"
                    onClick={onCopyInvite}
                    className="self-start text-body-sm font-medium text-terracotta-2 underline-offset-2 hover:underline"
                  >
                    {inviteCopied ? 'Copiato ✓' : 'Copia messaggio'}
                  </button>
                </div>
              )}
            </div>

            <FormField
              control={form.control}
              name="guestLanguage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lingua</FormLabel>
                  <FormControl>
                    <select
                      className="h-10 w-full rounded-card border border-line bg-paper px-3 text-body text-ink focus:border-terracotta-soft focus:outline-none focus:ring-2 focus:ring-terracotta-soft/40"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    >
                      {LANGUAGE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormDescription>La lingua dei messaggi che l'ospite riceverà.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="numGuests"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Numero ospiti (opzionale)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      placeholder="Es. 2"
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value === '' ? undefined : e.target.value)
                      }
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {submitError ? (
              <p role="alert" className="text-body-sm font-medium text-alert">
                {submitError}
              </p>
            ) : null}

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onSkip}
                disabled={submitting || skipping}
              >
                {skipping ? 'Salto…' : 'Salta per ora'}
              </Button>
              <Button type="submit" variant="accent" size="md" disabled={submitting || skipping}>
                {submitting ? 'Salvo…' : 'Salva e attiva Premura'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
