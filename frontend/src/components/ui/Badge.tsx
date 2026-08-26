import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "blue" | "red" | "green" | "amber" | "navy" | "slate" | "white";

const tones: Record<Tone, string> = {
  blue: "bg-primary-600 text-white",
  red: "bg-red-600 text-white",
  green: "bg-emerald-600 text-white",
  amber: "bg-amber-400 text-amber-950",
  navy: "bg-navy-900 text-white",
  slate: "bg-slate-100 text-slate-600",
  white: "bg-white/95 text-slate-800 shadow-sm",
};

export function Badge({
  tone = "blue",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Mapa de badges de produto → tom de cor. */
export const badgeTone: Record<string, Tone> = {
  NOVO: "green",
  OFERTA: "red",
  "MAIS VENDIDO": "amber",
};
