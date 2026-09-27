import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "blue" | "red" | "green" | "amber" | "navy" | "slate" | "white";

// Cores de estado como *superfície* → tokens `brand`/`danger`/`success`, que
// mantêm o tom nos dois temas (o texto branco por cima exige um tom médio).
// `amber` e `navy` são intencionalmente fixos (chip sobre fundo claro).
const tones: Record<Tone, string> = {
  blue: "bg-brand text-white",
  red: "bg-danger text-white",
  green: "bg-success text-white",
  amber: "bg-amber-400 text-amber-950",
  navy: "bg-navy-900 text-white",
  slate: "bg-slate-100 text-slate-600",
  white: "bg-surface/95 text-slate-800 shadow-sm",
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
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide",
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
