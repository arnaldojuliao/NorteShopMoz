"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Gera um SVG placeholder com a identidade NSM caso a imagem falhe. */
function fallbackSvg(label: string, emoji = "🛍️") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef4ff"/><stop offset="1" stop-color="#c0d3ff"/></linearGradient></defs><rect width="800" height="800" fill="url(#g)"/><text x="400" y="380" font-size="180" text-anchor="middle">${emoji}</text><text x="400" y="560" font-size="64" font-family="sans-serif" font-weight="700" fill="#1c2e7f" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function ProductImage({
  src,
  alt,
  fill,
  sizes,
  priority,
  emoji,
  label,
  imgClassName,
}: {
  src: string;
  alt: string;
  fill?: boolean;
  sizes?: string;
  priority?: boolean;
  emoji?: string;
  label?: string;
  imgClassName?: string;
}) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fallbackSvg(label ?? alt.slice(0, 18), emoji)}
        alt={alt}
        className={cn(
          fill ? "absolute inset-0 size-full object-cover" : "h-auto w-full",
          imgClassName,
        )}
        loading={priority ? "eager" : "lazy"}
        width={800}
        height={800}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      width={fill ? undefined : 800}
      height={fill ? undefined : 800}
      sizes={sizes ?? "(max-width: 768px) 50vw, 25vw"}
      priority={priority}
      className={imgClassName}
      onError={() => setErrored(true)}
    />
  );
}
