"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductImage } from "@/components/product/ProductImage";
import type { Product } from "@/lib/types";
import { newCategoryEmoji as categoryEmoji } from "@/lib/new-categories";

/**
 * Galeria do produto: imagem principal com setas e contador.
 *
 * No telemóvel é **full-bleed**: sem moldura, sem borda e a sangrar até aos
 * cantos do ecrã e ao header (o `-mx-3` cancela o padding do contentor e a
 * página remove o topo no mobile). As miniaturas abaixo saíram (a pedido) — a
 * navegação entre imagens é feita pelas setas e o contador mostra a posição.
 */
export function ProductGallery({ product }: { product: Product }) {
  const [active, setActive] = useState(0);
  const images = product.images;

  return (
    <div className="max-sm:-mx-3 lg:sticky lg:top-28">
      <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 max-sm:rounded-none max-sm:border-0">
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
              className="absolute left-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-slate-700 shadow-card transition hover:text-primary-700 active:scale-95"
              aria-label="Imagem anterior"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={() => setActive((i) => (i + 1) % images.length)}
              className="absolute right-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-slate-700 shadow-card transition hover:text-primary-700 active:scale-95"
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
    </div>
  );
}
