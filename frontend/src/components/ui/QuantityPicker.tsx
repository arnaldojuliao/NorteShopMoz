"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function QuantityPicker({
  value,
  onChange,
  min = 1,
  max = 99,
  size = "md",
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const sizes = {
    sm: {
      container: "h-10",
      button: "w-10",
      display: "w-10 text-sm",
      icon: "size-4",
    },
    md: {
      container: "h-12",
      button: "w-12",
      display: "w-12 text-base",
      icon: "size-5",
    },
    lg: {
      container: "h-14",
      button: "w-14",
      display: "w-14 text-lg",
      icon: "size-6",
    },
  };

  const s = sizes[size];

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-xl border border-slate-300 bg-white",
        s.container,
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        className={cn(
          "flex items-center justify-center text-slate-500 transition hover:text-primary-700 disabled:opacity-30 active:scale-95",
          s.button,
        )}
        aria-label="Diminuir quantidade"
      >
        <Minus className={s.icon} />
      </button>
      <span
        className={cn(
          "select-none text-center font-semibold tabular-nums text-slate-900",
          s.display,
        )}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        className={cn(
          "flex items-center justify-center text-slate-500 transition hover:text-primary-700 disabled:opacity-30 active:scale-95",
          s.button,
        )}
        aria-label="Aumentar quantidade"
      >
        <Plus className={s.icon} />
      </button>
    </div>
  );
}
