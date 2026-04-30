import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

// Varianti pensate per i data_source delle prenotazioni e per gli stati
// dot-based del prototipo (verde/giallo/rosso semaforo).
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-line-soft text-ink-soft",
        warn: "bg-peach text-terracotta-2 border border-terracotta-soft",
        gold: "bg-gold-soft text-gold-deep",
        ok: "bg-line-soft text-ok border border-ok/20",
        ink: "bg-ink/5 text-ink-soft",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
