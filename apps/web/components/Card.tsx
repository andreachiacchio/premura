import { type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardPadding = "tight" | "default" | "loose";

export interface CardProps {
  padding?: CardPadding;
  as?: ElementType;
  className?: string;
  children?: ReactNode;
}

const PADDING: Record<CardPadding, string> = {
  tight: "p-4",
  default: "p-6",
  loose: "p-8",
};

export function Card({
  padding = "default",
  as,
  className,
  children,
}: CardProps) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag
      className={cn(
        "bg-paper border border-line rounded-[16px] shadow-sm hover:shadow-md transition-shadow duration-200",
        PADDING[padding],
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export default Card;
