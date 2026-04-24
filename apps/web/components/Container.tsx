import { type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type ContainerVariant = "default" | "tight";

export interface ContainerProps {
  variant?: ContainerVariant;
  as?: ElementType;
  className?: string;
  children?: ReactNode;
}

const MAX_W: Record<ContainerVariant, string> = {
  default: "max-w-7xl",
  tight: "max-w-3xl",
};

export function Container({
  variant = "default",
  as,
  className,
  children,
}: ContainerProps) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag className={cn(MAX_W[variant], "mx-auto px-5 md:px-8", className)}>
      {children}
    </Tag>
  );
}

export default Container;
