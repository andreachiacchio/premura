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
import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

// Form di creazione prima property (M2a.4 slice 6 fase 6).
// 3 campi: name (required min 2), iCal Booking URL (opzionale, valido
// se presente), citta' (default Napoli per il pilot).
//
// Validazione zod allineata al server schema in actions.ts. Il form
// chiama createPropertyAction passata via prop per essere mockabile
// in test jsdom (stesso pattern di CompleteBookingDialog).

export const createPropertyFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Il nome deve avere almeno 2 caratteri')
    .max(255, 'Nome troppo lungo'),
  // string in input (RHF compatible), accetta vuoto o URL valido.
  // .refine evita il ZodUnion error generico di .or(literal('')) e
  // mantiene tipo input/output uniforme per il typing del Resolver.
  icalBookingUrl: z
    .string()
    .trim()
    .refine((v) => v === '' || z.string().url().safeParse(v).success, {
      message: 'URL non valido',
    }),
  city: z.string().trim().min(2, 'Citta troppo corta').max(128, 'Citta troppo lunga'),
});

export type CreatePropertyFormValues = z.infer<typeof createPropertyFormSchema>;

export type CreatePropertyActionFn = (formData: FormData) => Promise<void>;

export function AddPropertyDialog({
  open,
  onOpenChange,
  createAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createAction: CreatePropertyActionFn;
}) {
  const form = useForm<CreatePropertyFormValues>({
    resolver: zodResolver(createPropertyFormSchema),
    defaultValues: {
      name: '',
      icalBookingUrl: '',
      city: 'Napoli',
    },
  });

  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      form.reset({ name: '', icalBookingUrl: '', city: 'Napoli' });
      setSubmitError(null);
    }
  }, [open, form]);

  async function onSubmit(values: CreatePropertyFormValues) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const fd = new FormData();
      fd.set('name', values.name);
      fd.set('city', values.city);
      if (values.icalBookingUrl) {
        fd.set('icalBookingUrl', values.icalBookingUrl);
      }
      await createAction(fd);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Errore imprevisto, riprova.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aggiungi la tua struttura</DialogTitle>
          <DialogDescription>
            Bastano nome e citta&apos;. Il link iCal Booking lo puoi aggiungere ora o dopo dalle
            impostazioni.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome struttura</FormLabel>
                  <FormControl>
                    <Input placeholder="Es. La Goccia" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Citta&apos;</FormLabel>
                  <FormControl>
                    <Input placeholder="Napoli" autoComplete="address-level2" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="icalBookingUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Link iCal Booking (opzionale)</FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder="https://ical.booking.com/v1/export?..."
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Lo trovi su Booking nelle impostazioni della struttura, sezione Calendari
                    sincronizzati.
                  </FormDescription>
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
              <Button type="submit" variant="accent" size="md" disabled={submitting}>
                {submitting ? 'Salvo...' : 'Salva e inizia'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
