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
      guestLanguage: 'it',
      numGuests: undefined,
    },
  });

  const [submitting, setSubmitting] = React.useState(false);
  const [skipping, setSkipping] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Reset form quando il dialog si riapre per una booking diversa.
  React.useEffect(() => {
    if (open) {
      form.reset({
        guestFullName: '',
        guestPhone: '',
        guestLanguage: 'it',
        numGuests: undefined,
      });
      setSubmitError(null);
    }
  }, [open, booking.id, form]);

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
                  <FormDescription>
                    WhatsApp se possibile, e&apos; il canale di Premura.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="guestLanguage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lingua</FormLabel>
                  <FormControl>
                    <Input placeholder="it, en, de…" maxLength={8} {...field} />
                  </FormControl>
                  <FormDescription>Codice ISO breve. Default it.</FormDescription>
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
