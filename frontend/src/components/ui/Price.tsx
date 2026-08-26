"use client";

import { discountPct } from "@/lib/format";
import { useCurrency } from "@/context/CurrencyContext";
import { cn } from "@/lib/utils";

export function Price({
  price,
  oldPrice,
  size = "md",
  showDiscount,
  className,
}: {
  price: number;
  oldPrice?: number;
  size?: "sm" | "md" | "lg";
  showDiscount?: boolean;
  className?: string;
}) {
  const { format } = useCurrency();
  const pct = oldPrice ? discountPct(oldPrice, price) : 0;
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      <span
        className={cn(
          "font-display font-bold text-slate-900 tabular-nums",
          size === "lg" && "text-2xl",
          size === "md" && "text-lg",
          size === "sm" && "text-base",
        )}
      >
        {format(price)}
      </span>
      {oldPrice && oldPrice > price && (
        <>
          <span className="text-sm text-slate-400 line-through tabular-nums">
            {format(oldPrice)}
          </span>
          {showDiscount && pct > 0 && (
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-bold text-red-600">
              -{pct}%
            </span>
          )}
        </>
      )}
    </div>
  );
}
