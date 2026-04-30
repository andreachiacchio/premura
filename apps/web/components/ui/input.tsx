"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "flex h-11 w-full rounded-card border border-line bg-paper px-4 py-2",
          "text-body text-ink placeholder:text-ink-mute",
          "transition-colors focus:outline-none focus:border-terracotta-soft",
          "focus-visible:ring-2 focus-visible:ring-terracotta-soft focus-visible:ring-offset-2 focus-visible:ring-offset-ivory",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-alert aria-invalid:focus:border-alert",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
