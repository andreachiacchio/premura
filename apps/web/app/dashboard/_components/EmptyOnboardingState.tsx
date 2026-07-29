'use client';

import { Button } from '@/components/ui/button';
import * as React from 'react';
import { AddPropertyDialog, type CreatePropertyActionFn } from './AddPropertyDialog';

// Stato di benvenuto per host appena loggati senza alcuna property.
// Sostituisce sia EmptyState (lo state "0 incomplete con bookings
// esistenti") sia BookingsList. Click sul bottone apre il dialog
// di creazione prima struttura.

export function EmptyOnboardingState({
  createAction,
}: {
  createAction: CreatePropertyActionFn;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <div
        role="status"
        className="mx-5 mt-4 rounded-card border border-line-soft bg-paper px-5 py-8 text-left shadow-sm"
      >
        <p className="font-serif text-h3 leading-tight text-ink">Benvenuto su Premura.</p>
        <p className="mt-2 text-body text-ink-soft">
          Aggiungi la tua prima struttura per iniziare. Premura comincera&apos; a studiare gli
          ospiti appena le prenotazioni iniziano ad arrivare.
        </p>
        <div className="mt-5">
          <Button type="button" variant="accent" size="md" onClick={() => setOpen(true)}>
            Aggiungi struttura
          </Button>
        </div>
      </div>

      <AddPropertyDialog open={open} onOpenChange={setOpen} createAction={createAction} />
    </>
  );
}
