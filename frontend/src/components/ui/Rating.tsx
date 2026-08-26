import { Star, StarHalf } from "lucide-react";
import { cn } from "@/lib/utils";

export function Rating({
  value,
  count,
  size = "sm",
  showValue,
  className,
}: {
  value: number;
  count?: number;
  size?: "xs" | "sm" | "md";
  showValue?: boolean;
  className?: string;
}) {
  const stars = Array.from({ length: 5 }, (_, i) => {
    const filled = value >= i + 1;
    const half = !filled && value > i + 0.25 && value < i + 1;
    return (
      <span key={i} className="relative inline-flex">
        <Star
          className={cn(
            size === "xs" && "size-3",
            size === "sm" && "size-3.5",
            size === "md" && "size-4",
            "text-slate-200",
          )}
          fill="currentColor"
          strokeWidth={1.5}
        />
        {half && (
          <StarHalf
            className={cn(
              size === "xs" && "size-3",
              size === "sm" && "size-3.5",
              size === "md" && "size-4",
              "absolute inset-0 text-amber-400",
            )}
            fill="currentColor"
            strokeWidth={1.5}
          />
        )}
        {filled && !half && (
          <Star
            className={cn(
              size === "xs" && "size-3",
              size === "sm" && "size-3.5",
              size === "md" && "size-4",
              "absolute inset-0 text-amber-400",
            )}
            fill="currentColor"
            strokeWidth={1.5}
          />
        )}
      </span>
    );
  });

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="flex items-center gap-px" aria-label={`${value} de 5 estrelas`}>
        {stars}
      </div>
      {showValue && <span className="text-xs font-semibold text-slate-700">{value.toFixed(1)}</span>}
      {count != null && <span className="text-xs text-slate-400">({count})</span>}
    </div>
  );
}
