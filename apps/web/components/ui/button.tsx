"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

// Varianti calate sul prototipo Premura: accent terracotta (CTA primaria),
// ink scuro (secondaria), ghost (terziaria), link (skip-link).
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium " +
    "transition-[background,transform,box-shadow] duration-150 ease-[var(--ease-premura)] " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-soft " +
    "focus-visible:ring-offset-2 focus-visible:ring-offset-ivory " +
    "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        accent:
          "bg-terracotta text-paper shadow-md hover:bg-terracotta-2 active:translate-y-px",
        ink: "bg-ink text-paper hover:bg-ink-deep active:translate-y-px",
        ghost: "bg-transparent text-ink hover:bg-line-soft",
        link: "text-ink-mute underline-offset-2 hover:text-ink rounded-none px-0 py-0 h-auto",
      },
      size: {
        sm: "h-9 px-4 text-[13px]",
        md: "h-11 px-5 text-[15px]",
        lg: "h-12 px-6 text-[15px]",
      },
    },
    defaultVariants: {
      variant: "accent",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
