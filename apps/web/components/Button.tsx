import { type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "accent" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type SharedProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
  className?: string;
};

type NativeButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof SharedProps | "as">;
type NativeAnchorProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof SharedProps | "as">;

type ButtonAsButton = SharedProps & NativeButtonProps & { as?: "button" };
type ButtonAsAnchor = SharedProps & NativeAnchorProps & { as: "a" };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-ivory disabled:opacity-50 disabled:pointer-events-none";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink text-ivory hover:bg-ink-deep",
  secondary: "bg-paper border border-line text-ink hover:bg-paper-deep",
  accent: "bg-terracotta text-paper hover:bg-terracotta-2",
  ghost: "bg-transparent text-ink-soft hover:text-ink",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-body-sm",
  md: "h-10 px-5 text-body",
  lg: "h-12 px-6 text-body-lg",
};

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    leftIcon,
    rightIcon,
    className,
    children,
    as,
    ...rest
  } = props;

  const classes = cn(BASE, VARIANTS[variant], SIZES[size], className);

  const content = (
    <>
      {leftIcon ? <span className="inline-flex shrink-0">{leftIcon}</span> : null}
      {children}
      {rightIcon ? <span className="inline-flex shrink-0">{rightIcon}</span> : null}
    </>
  );

  if (as === "a") {
    return (
      <a className={classes} {...(rest as NativeAnchorProps)}>
        {content}
      </a>
    );
  }

  return (
    <button className={classes} {...(rest as NativeButtonProps)}>
      {content}
    </button>
  );
}

export default Button;
