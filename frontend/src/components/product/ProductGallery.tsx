"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductImage } from "@/components/product/ProductImage";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";
import { categoryEmoji } from "@/lib/data/categories";

export function ProductGallery({ product }: { product: Product }) {
  const [active, setActive] = useState(0);
  const images = product.images;

  return (
    <div className="lg:sticky lg:top-28">
      <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
        <div className="relative aspect-square">
          <ProductImage
            src={images[active]}
            alt={`${product.name} — imagem ${active + 1}`}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 45vw"
            emoji={categoryEmoji(product.category)}
            label={product.name}
            imgClassName="object-cover"
          />
        </div>

        {images.length > 1 && (
          <>
            <button
              onClick={() => setActive((i) => (i - 1 + images.length) % images.length)}
              className="absolute left-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-card transition hover:text-primary-700 active:scale-95"
              aria-label="Imagem anterior"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={() => setActive((i) => (i + 1) % images.length)}
              className="absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-card transition hover:text-primary-700 active:scale-95"
              aria-label="Próxima imagem"
            >
              <ChevronRight className="size-5" />
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-navy-950/70 px-2.5 py-1 text-xs font-semibold text-white">
              {active + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-3 grid grid-cols-4 gap-2.5">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Ver imagem ${i + 1}`}
              aria-current={i === active}
              className={cn(
                "relative aspect-square overflow-hidden rounded-xl border-2 transition-all",
                i === active
                  ? "border-primary-600 ring-2 ring-primary-600/20"
                  : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <ProductImage
                src={img}
                alt=""
                fill
                sizes="120px"
                emoji={categoryEmoji(product.category)}
                label=""
                imgClassName="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
