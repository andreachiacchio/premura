'use client';

import * as React from 'react';
import {
  AddBookingDialog,
  type CreateDirectBookingActionFn,
  type PropertyOption,
} from './AddBookingDialog';

// Involucro client per "Aggiungi prenotazione": tiene lo stato aperto/
// chiuso e lascia che i server component si limitino a passare le
// property e la server action come prop tipizzata (stesso schema di
// CompleteBookingDialog — cosi' il check statico CI sulle closure
// inline nelle form action non scatta).
//
// Tre varianti visive perche' i tre innesti hanno peso diverso:
//   - 'primary'  bottone pieno, quando e' l'azione principale della
//                schermata (home vuota, pagina check-in vuota)
//   - 'outline'  bordato, quando affianca contenuto esistente
//   - 'link'     testuale, dentro la riga azioni della card struttura

export type AddBookingButtonVariant = 'primary' | 'outline' | 'link';

const CLASSI: Record<AddBookingButtonVariant, string> = {
  primary:
    'inline-flex h-11 items-center justify-center rounded-full bg-terracotta px-6 text-body-sm font-medium text-paper shadow-md transition-colors hover:bg-terracotta-2',
  outline:
    'inline-flex h-10 items-center justify-center rounded-full border border-line bg-paper px-4 text-body-sm font-medium text-ink transition-colors hover:border-terracotta',
  link: 'text-body-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline',
};

export function AddBookingButton({
  properties,
  defaultPropertyId,
  createAction,
  variant = 'outline',
  label = '+ Aggiungi prenotazione',
}: {
  properties: PropertyOption[];
  defaultPropertyId?: string;
  createAction: CreateDirectBookingActionFn;
  variant?: AddBookingButtonVariant;
  label?: string;
}): React.JSX.Element | null {
  const [open, setOpen] = React.useState(false);

  // Senza strutture non c'e' niente su cui prenotare: il bottone
  // porterebbe a un form impossibile da compilare.
  if (properties.length === 0) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={CLASSI[variant]}>
        {label}
      </button>
      <AddBookingDialog
        open={open}
        onOpenChange={setOpen}
        properties={properties}
        defaultPropertyId={defaultPropertyId}
        createAction={createAction}
      />
    </>
  );
}
