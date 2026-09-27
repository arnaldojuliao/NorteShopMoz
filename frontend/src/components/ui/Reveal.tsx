"use client";

import { useInView } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, visible } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      // `.reveal-wait` (e não `opacity-0`) para que o conteúdo apareça quando
      // não há JavaScript — ver globals.css.
      className={cn(visible ? "animate-fade-up" : "reveal-wait", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
