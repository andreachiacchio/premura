import { type CSSProperties, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type HeadingLevel = 1 | 2 | 3;

export interface HeadingProps {
  level: HeadingLevel;
  as?: ElementType;
  soft?: number;
  className?: string;
  children?: ReactNode;
}

const SIZE_CLASS: Record<HeadingLevel, string> = {
  1: "text-h1",
  2: "text-h2",
  3: "text-h3",
};

const DEFAULT_TAG: Record<HeadingLevel, ElementType> = {
  1: "h1",
  2: "h2",
  3: "h3",
};

export function Heading({
  level,
  as,
  soft,
  className,
  children,
}: HeadingProps) {
  const Tag: ElementType = as ?? DEFAULT_TAG[level];
  const style: CSSProperties | undefined =
    soft === undefined ? undefined : { fontVariationSettings: `"SOFT" ${soft}` };

  return (
    <Tag
      className={cn("font-serif text-ink", SIZE_CLASS[level], className)}
      style={style}
    >
      {children}
    </Tag>
  );
}

export default Heading;
