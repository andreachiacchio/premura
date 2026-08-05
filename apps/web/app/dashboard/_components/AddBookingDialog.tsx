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

// "Aggiungi prenotazione" (Andrea 05/08).
//
// Nasce dal caso migliore, non dal ripiego: nella diretta l'host ha
// gia' nome, telefono, email, lingua e numero ospiti, e non paga
// commissioni. E' l'unico caso in cui Premura funziona al 100% dal
// primo minuto — quindi il form chiede tutto subito, senza passaggi.
//
// Il telefono e' l'unico campo che cambia davvero le cose: senza,
// l'agente non ha un canale. Lo diciamo nel form invece di scoprirlo
// dopo.

export const addBookingFormSchema = z
  .object({
    propertyId: z.string().uuid('Scegli la struttura'),
    platform: z.enum(['direct', 'booking', 'airbnb', 'altro']),
    guestFullName: z.string().trim().min(2, 'Il nome deve avere almeno 2 caratteri'),
    guestPhone: z.string().trim().optional(),
    guestEmail: z.string().trim().optional(),
    guestLanguage: z
      .string()
      .trim()
      .min(2, 'Scegli la lingua: senza, il messaggio parte nella lingua sbagliata'),
    numGuests: z.coerce.number().int().min(1, 'Almeno 1 ospite').max(20, 'Troppi ospiti'),
    checkinDate: z.string().min(1, 'Quando arriva?'),
    checkoutDate: z.string().min(1, 'Quando riparte?'),
    priceTotal: z.string().trim().optional(),
    hostNotes: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.checkoutDate > v.checkinDate, {
    message: 'La partenza deve essere dopo l’arrivo',
    path: ['checkoutDate'],
  });

export type AddBookingFormValues = z.input<typeof addBookingFormSchema>;

export type CreateDirectBookingResultView =
  | { ok: true; absorbed: boolean; premuraActivated: boolean; partialOverlapCount: number }
  | { ok: false; error: string };

export type CreateDirectBookingActionFn = (
  formData: FormData,
) => Promise<CreateDirectBookingResultView>;

export type PropertyOption = { id: string; name: string };

// Le stesse 5 lingue del completamento manuale: quelle che un host
// italiano incontra davvero.
const LANGUAGE_OPTIONS = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
] as const;

// L'origine e' un asse separato dal comportamento dell'agente:
// "diretta" significa che l'host possiede la relazione col cliente e
// non paga commissioni. Vrbo/Expedia/Agoda stanno in "altro" apposta.
const PLATFORM_OPTIONS = [
  { value: 'direct', label: 'Diretta' },
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'booking', label: 'Booking.com' },
  { value: 'altro', label: 'Altro canale' },
] as const;

export function AddBookingDialog({
  open,
  onOpenChange,
  properties,
  defaultPropertyId,
  createAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  properties: PropertyOption[];
  defaultPropertyId?: string;
  createAction: CreateDirectBookingActionFn;
}): React.JSX.Element {
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [esito, setEsito] = React.useState<
    (CreateDirectBookingResultView & { ok: true }) | null
  >(null);

  function chiudi(): void {
    setEsito(null);
    setSubmitError(null);
    form.reset();
    onOpenChange(false);
  }

  const form = useForm<AddBookingFormValues>({
    resolver: zodResolver(addBookingFormSchema),
    defaultValues: {
      propertyId: defaultPropertyId ?? properties[0]?.id ?? '',
      platform: 'direct',
      guestFullName: '',
      guestPhone: '',
      guestEmail: '',
      // Nessun default: la lingua sbagliata e' peggio di nessuna lingua.
      guestLanguage: '',
      numGuests: 2,
      checkinDate: '',
      checkoutDate: '',
      priceTotal: '',
      hostNotes: '',
    },
  });

  async function onSubmit(values: AddBookingFormValues): Promise<void> {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(values)) {
        if (v !== undefined && v !== null && v !== '') fd.set(k, String(v));
      }
      const res = await createAction(fd);
      if (!res.ok) {
        setSubmitError(res.error);
        return;
      }
      // L'esito NON si butta via: se abbiamo preso il posto di una
      // fascia occupata, o se ne restano altre che si sovrappongono,
      // l'host deve saperlo adesso — non trovarselo domani.
      if (res.absorbed || res.partialOverlapCount > 0 || !res.premuraActivated) {
        setEsito(res);
        return;
      }
      form.reset();
      onOpenChange(false);
    } catch {
      setSubmitError('Non sono riuscito a salvare, riprova.');
    } finally {
      setSubmitting(false);
    }
  }

  const telefono = form.watch('guestPhone');

  if (esito) {
    return (
      <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : chiudi())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prenotazione salvata</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 text-body-sm text-ink">
            {esito.absorbed && (
              <p>
                Ha preso il posto di una fascia occupata che avevo già sul calendario: adesso è
                una prenotazione con un nome, non più una data anonima.
              </p>
            )}
            {!esito.premuraActivated && (
              <p className="rounded-card border border-gold-soft bg-gold-soft/30 p-3">
                Senza numero WhatsApp non posso occuparmene: l’ho salvata, ma resta ferma finché
                non aggiungi il contatto.
              </p>
            )}
            {esito.partialOverlapCount > 0 && (
              <p className="rounded-card border border-line bg-paper p-3 text-ink-soft">
                Su queste date restano{' '}
                {esito.partialOverlapCount === 1
                  ? 'un’altra fascia occupata che non coincide'
                  : `altre ${esito.partialOverlapCount} fasce occupate che non coincidono`}
                . Non le ho toccate: le trovi in «Date occupate».
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ink" onClick={chiudi}>
              Ho capito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aggiungi prenotazione</DialogTitle>
          <DialogDescription>
            Per le prenotazioni prese al telefono, via email o da un canale che non leggo da solo.
            Se hai il numero, Premura parte da qui.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {properties.length > 1 && (
              <FormField
                control={form.control}
                name="propertyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Struttura</FormLabel>
                    <FormControl>
                      <select
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                        className="h-11 w-full rounded-card border border-line bg-paper px-3 text-body-sm text-ink"
                      >
                        {properties.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="checkinDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Arrivo</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="checkoutDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partenza</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="guestFullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome dell’ospite</FormLabel>
                  <FormControl>
                    <Input placeholder="Giulia Rossi" {...field} />
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
                  <FormLabel>WhatsApp</FormLabel>
                  <FormControl>
                    <Input placeholder="+39 333 1234567" {...field} />
                  </FormControl>
                  <FormDescription>
                    {telefono
                      ? 'Con il numero Premura si occupa di questo ospite.'
                      : 'Senza numero salvo la prenotazione, ma l’agente non può scrivere.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="guestLanguage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lingua</FormLabel>
                    <FormControl>
                      <select
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                        className="h-11 w-full rounded-card border border-line bg-paper px-3 text-body-sm text-ink"
                      >
                        <option value="">Seleziona…</option>
                        {LANGUAGE_OPTIONS.map((l) => (
                          <option key={l.value} value={l.value}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="numGuests"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ospiti</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={20} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="guestEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (facoltativa)</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="giulia@esempio.it" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="platform"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Da dove arriva</FormLabel>
                    <FormControl>
                      <select
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                        className="h-11 w-full rounded-card border border-line bg-paper px-3 text-body-sm text-ink"
                      >
                        {PLATFORM_OPTIONS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priceTotal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prezzo (facoltativo)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="450" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="hostNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (facoltative)</FormLabel>
                  <FormControl>
                    <Input placeholder="Arriva tardi, allergica alle noci…" {...field} />
                  </FormControl>
                  {/* Onesto: oggi le note restano sulla prenotazione ma
                      non sono ancora mostrate in nessuna vista. Non
                      promettiamo di fargliele rivedere. */}
                  <FormDescription>Restano sulla prenotazione. L’ospite non le vede.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {submitError && <p className="text-body-sm text-terracotta-2">{submitError}</p>}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Annulla
              </Button>
              <Button type="submit" variant="ink" disabled={submitting}>
                {submitting ? 'Salvo…' : 'Salva'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
