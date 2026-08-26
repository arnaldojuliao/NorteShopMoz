"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, ShoppingCart } from "lucide-react";
import { useRef } from "react";
import type { Product } from "@/lib/types";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";
import { Badge, badgeTone } from "@/components/ui/Badge";
import { Rating } from "@/components/ui/Rating";
import { ProductImage } from "@/components/product/ProductImage";
import { discountPct } from "@/lib/format";
import { useCurrency } from "@/context/CurrencyContext";
import { categoryEmoji } from "@/lib/data/categories";
import { useRequireAuth } from "@/components/auth/RequireAuth";

export function ProductRail({ products, id }: { products: Product[]; id?: string }) {
  const rail = useRef<HTMLDivElement>(null);
  const { addItem } = useCart();
  const { notify } = useToast();
  const { checkAuth } = useRequireAuth();
  const { format } = useCurrency();

  const scrollBy = (dir: 1 | -1) => {
    rail.current?.scrollBy({ left: dir * rail.current.clientWidth * 0.8, behavior: "smooth" });
  };

  const handleAddToCart = (product: Product) => {
    const handled = checkAuth(() => {
      addItem(product);
      notify("Adicionado ao carrinho 🛒");
    });
    if (!handled) {
      // O modal de login foi aberto pelo checkAuth
    }
  };

  return (
    <div className="relative">
      <div
        ref={rail}
        id={id}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-1 sm:mx-0 sm:px-0"
      >
        {products.map((p) => {
          const pct = p.oldPrice ? discountPct(p.oldPrice, p.price) : 0;
          return (
            <article
              key={p.id}
              className="group w-44 shrink-0 snap-start overflow-hidden rounded-2xl border border-slate-100 bg-white transition-all hover:border-slate-200 hover:shadow-card-hover sm:w-52"
            >
              <Link href={`/produto/${p.slug}`} className="block">
                <div className="relative aspect-square overflow-hidden bg-slate-100">
                  <ProductImage
                    src={p.images[0]}
                    alt={p.name}
                    fill
                    sizes="208px"
                    emoji={categoryEmoji(p.category)}
                    label={p.name}
                    imgClassName="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                  />
                  {pct > 0 && <Badge tone="red" className="absolute left-2 top-2">-{pct}%</Badge>}
                  {p.badges.filter((b) => b !== "OFERTA")[0] && (
                    <Badge
                      tone={badgeTone[p.badges.filter((b) => b !== "OFERTA")[0]]}
                      className="absolute right-2 top-2"
                    >
                      {p.badges.filter((b) => b !== "OFERTA")[0]}
                    </Badge>
                  )}
                </div>
              </Link>
              <div className="space-y-1 p-3">
                <Link
                  href={`/produto/${p.slug}`}
                  className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-800 hover:text-primary-700"
                >
                  {p.name}
                </Link>
                <Rating value={p.rating} count={p.ratingCount} size="xs" />
                <div className="flex items-center gap-1.5">
                  <span className="font-display text-[15px] font-bold text-slate-900 tabular-nums">
                    {format(p.price)}
                  </span>
                  {p.oldPrice && (
                    <span className="text-[11px] text-slate-400 line-through">
                      {format(p.oldPrice)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleAddToCart(p)}
                  className="mt-1 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-primary-50 text-xs font-semibold text-primary-700 transition hover:bg-primary-600 hover:text-white active:scale-[0.98]"
                >
                  <ShoppingCart className="size-3.5" /> Adicionar
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {products.length > 4 && (
        <>
          <button
            onClick={() => scrollBy(-1)}
            aria-label="Deslocar para trás"
            className="absolute -left-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-card transition hover:text-primary-700 lg:flex"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            onClick={() => scrollBy(1)}
            aria-label="Deslocar para a frente"
            className="absolute -right-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-card transition hover:text-primary-700 lg:flex"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}
    </div>
  );
}
