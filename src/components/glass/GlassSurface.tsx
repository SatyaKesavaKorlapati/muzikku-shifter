import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function GlassSurface({
  children,
  className,
  chrome = false,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  chrome?: boolean;
  as?: "div" | "section" | "header" | "article";
}) {
  return (
    <Tag className={cn(chrome ? "glass-chrome" : "panel", "overflow-hidden rounded-[28px]", className)}>
      {chrome ? <div className="refraction" /> : null}
      <div className="relative">{children}</div>
    </Tag>
  );
}
