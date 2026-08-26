"use client";

import Link from "next/link";
import { ShoppingCart, Truck } from "lucide-react";
import type { Product } from "@/lib/types";
import { formatCompact, discountPct } from "@/lib/format";
import { useCurrency } from "@/context/CurrencyContext";
import { Badge, badgeTone } from "@/components/ui/Badge";
import { Rating } from "@/components/ui/Rating";
import { ProductImage } from "@/components/product/ProductImage";
import { WishlistButton } from "@/components/product/WishlistButton";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";
import { categoryEmoji } from "@/lib/data/categories";
import { cn } from "@/lib/utils";
import { useRequireAuth } from "@/components/auth/RequireAuth";

export function ProductCard({
  product,
  className,
  eager,
  hidePrice,
  hideCart,
  hideShipping,
}: {
  product: Product;
  className?: string;
  eager?: boolean;
  /** Oculta o bloco de preço (preço atual e antigo). */
  hidePrice?: boolean;
  /** Oculta os botões de carrinho (ações rápidas e botão mobile). */
  hideCart?: boolean;
  /** Oculta a linha de envio (dias de entrega e vendidos). */
  hideShipping?: boolean;
}) {
  const { addItem } = useCart();
  const { notify } = useToast();
  const { checkAuth } = useRequireAuth();
  const { format } = useCurrency();
  const pct = product.oldPrice ? discountPct(product.oldPrice, product.price) : 0;
  const out = product.stock <= 0;

  const handleAddToCart = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const handled = checkAuth(() => {
      if (out) return;
      addItem(product);
      notify("Adicionado ao carrinho 🛒");
    });
    if (!handled) {
      // O modal de login foi aberto pelo checkAuth
    }
  };

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white p-2 transition-all duration-300 hover:-translate-y-1 hover:border-slate-200 hover:shadow-card-hover",
        className,
      )}
    >
      {/* Imagem em moldura própria */}
      <div className="relative aspect-square overflow-hidden rounded-xl bg-gradient-to-br from-slate-50 to-slate-100">
        <ProductImage
          src={product.images[0]}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 20vw"
          priority={eager}
          emoji={categoryEmoji(product.category)}
          label={product.name}
          imgClassName="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
        />

        {/* Link da imagem — overlay acessível */}
        <Link
          href={`/produto/${product.slug}`}
          aria-label={product.name}
          className="absolute inset-0 z-[1]"
        />

        {/* Degradê sutil no hover para dar profundidade */}
        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-navy-950/30 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* Badges */}
        <div className="pointer-events-none absolute left-2 top-2 z-[2] flex flex-col items-start gap-1">
          {pct > 0 && <Badge tone="red">-{pct}%</Badge>}
          {product.badges
            .filter((b) => b !== "OFERTA")
            .slice(0, 1)
            .map((b) => (
              <Badge key={b} tone={badgeTone[b]}>
                {b}
              </Badge>
            ))}
        </div>

        {/* Favoritos */}
        <div className="absolute right-2 top-2 z-[3]">
          <WishlistButton product={product} size="sm" />
        </div>

        {/* Ações rápidas no hover (desktop) */}
        {!hideCart && (
        <div className="absolute inset-x-2 bottom-2 z-[3] hidden translate-y-2 items-center gap-1.5 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 sm:flex">
          <button
            onClick={handleAddToCart}
            disabled={out}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-navy-900/90 text-xs font-semibold text-white shadow-sm backdrop-blur transition hover:bg-primary-700 disabled:opacity-50"
          >
            <ShoppingCart className="size-3.5" />
            {out ? "Esgotado" : "Adicionar"}
          </button>
        </div>
        )}
      </div>

      {/* Informação compacta */}
      <div className="flex flex-1 flex-col gap-1 p-2 pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {product.brand ?? "NSM Select"}
          </span>
          {product.freeShipping && (
            <span className="shrink-0 text-[9px] font-bold text-emerald-600">ENVIO GRÁTIS</span>
          )}
        </div>

        <Link href={`/produto/${product.slug}`} className="group/title">
          <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-800 transition group-hover/title:text-primary-700">
            {product.name}
          </h3>
        </Link>

        <Rating value={product.rating} count={product.ratingCount} size="xs" />

        {!hidePrice && (
          <div className="mt-auto flex items-baseline gap-1.5 pt-0.5">
            <span className="font-display text-base font-bold text-slate-900 tabular-nums">
              {format(product.price)}
            </span>
            {product.oldPrice && (
              <span className="text-[11px] text-slate-400 line-through">
                {format(product.oldPrice)}
              </span>
            )}
          </div>
        )}

        {!hideShipping && (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <Truck className="size-3 text-primary-500" aria-hidden />
            {product.deliveryDays[0]}–{product.deliveryDays[1]} dias ·{" "}
            {formatCompact(product.sold)} vendidos
          </span>
          <button
            onClick={handleAddToCart}
            disabled={out}
            aria-label={`Adicionar ${product.name} ao carrinho`}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 transition-all hover:bg-primary-600 hover:text-white active:scale-95 disabled:opacity-40 sm:hidden"
          >
            <ShoppingCart className="size-3.5" />
          </button>
        </div>
        )}
      </div>
    </article>
  );
}
