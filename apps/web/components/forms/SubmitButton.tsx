'use client';

import { Button, type ButtonProps } from '@/components/Button';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

// BUG-001 TASK A — Submit button con stato pending via useFormStatus.
//
// Pattern: wrap del design system <Button> con feedback automatico per
// <form action={serverAction}>. Quando la server action e' in volo:
//  - button disabled (double-click protection nativa)
//  - aria-busy=true per screen reader
//  - cursor: wait + opacity ridotta (gia' coperto da disabled:opacity-50)
//  - label cambia in `pendingLabel` (default "Attendere…")
//
// NOTE: deve essere usato DENTRO <form action={...}> per funzionare.
// useFormStatus legge il context del form parent piu' vicino.

type Variant = NonNullable<ButtonProps['variant']>;
type Size = NonNullable<ButtonProps['size']>;

type SubmitButtonProps = {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  variant?: Variant;
  size?: Size;
  // Per casi "skip step" — applica stile più discreto (ghost + underline).
  // Equivalente a variant='ghost' ma con underline per chiarezza.
  asSkip?: boolean;
};

export function SubmitButton({
  children,
  pendingLabel = 'Attendere…',
  className,
  variant = 'accent',
  size = 'md',
  asSkip = false,
}: SubmitButtonProps): React.JSX.Element {
  const { pending } = useFormStatus();

  if (asSkip) {
    return (
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className={cn(
          'text-body-sm text-ink-mute underline underline-offset-4 decoration-line transition-colors hover:text-ink hover:decoration-ink disabled:opacity-50 disabled:cursor-wait',
          className,
        )}
      >
        {pending ? pendingLabel : children}
      </button>
    );
  }

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      aria-busy={pending}
      className={cn(pending && 'cursor-wait', className)}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
