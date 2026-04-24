import { type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type EyebrowVariant = "default" | "terracotta";

export interface EyebrowProps {
  variant?: EyebrowVariant;
  as?: ElementType;
  className?: string;
  children?: ReactNode;
}

const COLORS: Record<EyebrowVariant, string> = {
  default: "text-ink-mute",
  terracotta: "text-terracotta",
};

export function Eyebrow({
  variant = "default",
  as,
  className,
  children,
}: EyebrowProps) {
  const Tag: ElementType = as ?? "p";
  return (
    <Tag
      className={cn(
        "text-eyebrow uppercase font-semibold",
        COLORS[variant],
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export default Eyebrow;
