"use client";

import { cn } from "@/lib/utils";

/**
 * Avatar circular do utilizador: mostra a foto de perfil quando existe,
 * senão a inicial do nome (fallback com a identidade NSM).
 */
export function Avatar({
  src,
  name,
  className,
  textClassName,
}: {
  src?: string | null;
  name?: string;
  className?: string;
  textClassName?: string;
}) {
  const initial = (name || "C").trim().charAt(0).toUpperCase() || "C";

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-primary-600 font-display font-bold text-white",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL do perfil local
        <img
          src={src}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className={cn("leading-none", textClassName)}>{initial}</span>
      )}
    </span>
  );
}
