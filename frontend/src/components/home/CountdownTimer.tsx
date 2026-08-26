"use client";

import { Clock } from "lucide-react";
import { useCountdownToMidnight } from "@/lib/hooks";
import { cn } from "@/lib/utils";

function CountdownBlock({
  value,
  label,
  onDark,
}: {
  value: string;
  label: string;
  onDark: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={cn(
          "flex h-9 min-w-9 items-center justify-center rounded-lg px-1.5 font-display text-base font-bold tabular-nums",
          onDark ? "bg-white/10 text-white backdrop-blur" : "bg-red-50 text-red-600",
        )}
      >
        {value}
      </span>
      <span
        className={cn(
          "mt-1 text-[9px] font-semibold uppercase tracking-wider",
          onDark ? "text-white/60" : "text-slate-400",
        )}
      >
        {label}
      </span>
    </div>
  );
}

/** Contador dinâmico até ao fim do dia — isolado para não re-renderizar a secção. */
export function CountdownTimer({ onDark = true }: { onDark?: boolean }) {
  const time = useCountdownToMidnight();
  const [h, m, s] = time.split(":");
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "mr-0.5 flex items-center gap-1.5 text-xs font-semibold",
          onDark ? "text-white/80" : "text-slate-500",
        )}
      >
        <Clock className={cn("size-4", onDark ? "text-amber-300" : "text-red-500")} /> Termina em:
      </span>
      <CountdownBlock value={h} label="horas" onDark={onDark} />
      <span className={cn("pb-4 font-display text-lg font-bold", onDark ? "text-white/50" : "text-slate-300")}>
        :
      </span>
      <CountdownBlock value={m} label="min" onDark={onDark} />
      <span className={cn("pb-4 font-display text-lg font-bold", onDark ? "text-white/50" : "text-slate-300")}>
        :
      </span>
      <CountdownBlock value={s} label="seg" onDark={onDark} />
    </div>
  );
}
