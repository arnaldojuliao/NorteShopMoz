"use client";

import Link from "next/link";
import { Package, ShoppingCart, Truck } from "lucide-react";
import type { Product } from "@/lib/types";
import { formatCompact } from "@/lib/format";
import { useCurrency } from "@/context/CurrencyContext";
import { Badge, badgeTone } from "@/components/ui/Badge";
import { ProductImage } from "@/components/product/ProductImage";
import { WishlistButton } from "@/components/product/WishlistButton";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";
import { newCategoryEmoji as categoryEmoji } from "@/lib/new-categories";
import { cn } from "@/lib/utils";

/** Abaixo destas unidades o cartão avisa que o stock está a acabar. */
const LOW_STOCK = 10;

export function ProductCard({
  product,
  className,
  eager,
  hidePrice,
  hideCart,
  hideShipping,
  showOfferBadge,
  hideStock,
  dealLayout,
  imageAspect,
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
  /** Mostra também o selo OFERTA nas listagens normais (vem com `dealLayout`). */
  showOfferBadge?: boolean;
  /** Oculta o indicador de stock mesmo quando é relevante. */
  hideStock?: boolean;
  /**
   * Cartão promocional compacto (ofertas relâmpago): mantém o aspeto compacto
   * em TODOS os tamanhos de ecrã e implica `showOfferBadge`, `hideStock` e
   * `hideShipping`. Sem percentuais — o cartão mostra o número de vendas.
   *
   * Fora das secções promocionais, o cartão usa este MESMO aspeto compacto
   * apenas no telemóvel (<640px) — imagem a sangrar, uma linha de nome, preço +
   * antigo + número de vendas e botão de compra no canto da imagem — e volta
   * ao cartão completo (marca, duas linhas, envio, botão em hover) a partir de
   * `sm`, sem duplicar o DOM: as diferenças são classes responsivas.
   */
  dealLayout?: boolean;
  /**
   * Proporção da imagem (classe Tailwind de aspect-*) — o mosaico varia a
   * altura dos cartões alternando proporções; por omissão mantém o quadrado.
   */
  imageAspect?: string;
}) {
  const { addItem } = useCart();
  const { notify } = useToast();
  const { format } = useCurrency();
  const out = product.stock <= 0;

  // `dealLayout` ativa todas as opções das secções promocionais de uma vez.
  const offerBadge = showOfferBadge || dealLayout;
  const noStock = hideStock || dealLayout;
  const noShipping = hideShipping || dealLayout;
  // Sem `showOfferBadge` o selo OFERTA fica de fora nas listagens normais (está
  // em todo o catálogo) — no telemóvel, onde todos os cartões seguem o aspeto
  // promocional, ele aparece de qualquer modo (ver `mobileOfferBadge`).
  // «Em destaque»: produtos marcados como featured ganham a etiqueta azul,
  // mesmo quando o catálogo (API) não a traz no array de badges.
  const sourceBadges =
    product.featured && !product.badges.includes("DESTAQUE")
      ? (["DESTAQUE", ...product.badges] as Product["badges"])
      : product.badges;
  const badges = sourceBadges
    .filter((b) => offerBadge || b !== "OFERTA")
    .slice(0, offerBadge ? 2 : 1);
  const mobileOfferBadge = !offerBadge && product.badges.includes("OFERTA");

  // Quantidade rápida sem conta: o carrinho de convidado é suportado (ver BuyBox).
  const handleAddToCart = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (out) return;
    addItem(product);
    notify("Adicionado ao carrinho 🛒");
  };

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-surface transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-card-hover",
        dealLayout ? "p-0" : "p-0 sm:p-2",
        className,
      )}
    >
      {/* Imagem: a sangrar no telemóvel (maior), com moldura no desktop. A
          proporção vem do mosaico (imageAspect) — é ela que varia a altura
          dos cartões; por omissão, quadrada. */}
      <div
        className={cn(
          "relative overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100",
          imageAspect ?? "aspect-square",
          !dealLayout && "sm:rounded-xl",
        )}
      >
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

        {/* Badges. O selo de percentual foi retirado a pedido — o cartão mostra o
            número de vendas, no bloco do preço. */}
        <div className="pointer-events-none absolute left-2 top-2 z-[2] flex flex-col items-start gap-1">
          {mobileOfferBadge && (
            <span className="sm:hidden">
              <Badge tone="red">OFERTA</Badge>
            </span>
          )}
          {badges.map((b) => (
            <Badge key={b} tone={badgeTone[b]}>
              {b}
            </Badge>
          ))}
        </div>

        {/* Favoritos */}
        <div className="absolute right-2 top-2 z-[3]">
          <WishlistButton product={product} size="sm" />
        </div>

        {/* Botão de compra: ajustado ao canto da imagem (sem ocupar altura no
            bloco de informação). No cartão completo é só para telemóvel; a partir
            de `sm` toma conta o botão fixo abaixo. No dealLayout (ofertas) fica
            visível em TODOS os ecrãs — é a secção de maior intenção de compra. */}
        {!hideCart && (
          <button
            onClick={handleAddToCart}
            disabled={out}
            aria-label={`Adicionar ${product.name} ao carrinho`}
            className={cn(
              "absolute bottom-2 right-2 z-[3] flex size-9 items-center justify-center rounded-full bg-surface/95 text-primary-700 shadow-card transition-all hover:bg-brand hover:text-white active:scale-95 disabled:opacity-50",
              !dealLayout && "sm:hidden",
              dealLayout && "lg:hidden",
            )}
          >
            <ShoppingCart className="size-4" />
          </button>
        )}

        {/* Botão de compra no canto (desktop ≥sm; ≥lg nos deals): escondido e
            revelado ao passar o rato — sobe suave + fundo da marca. Fica também
            acessível por teclado (group-focus-within). No ecrãs touch o botão
            redondo permanente acima é que cobre. */}
        {!hideCart && (
          <button
            onClick={handleAddToCart}
            disabled={out}
            title={out ? "Esgotado" : "Adicionar ao carrinho"}
            aria-label={`Adicionar ${product.name} ao carrinho`}
            className={cn(
              "absolute bottom-2 right-2 z-[3] hidden size-9 items-center justify-center rounded-full bg-surface/95 text-primary-700 opacity-0 shadow-card transition-all duration-200 translate-y-1 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-brand hover:text-white active:scale-95 disabled:opacity-50",
              !dealLayout && "sm:flex",
              dealLayout && "lg:flex",
            )}
          >
            <ShoppingCart className="size-4" />
          </button>
        )}
      </div>

      {/* Informação compacta */}
      <div
        className={cn(
          "flex flex-1 flex-col gap-1 p-2",
          dealLayout ? "pt-1.5" : "pt-1.5 sm:pt-2.5",
        )}
      >
        {/* Linha de marca (e envio grátis) — só no cartão completo, para o
            telemóvel ficar só com o essencial. `slate-500` e não `slate-400`:
            no tema escuro o 400 fica abaixo do AA em texto tão pequeno. */}
        {!dealLayout && (
          <div className="hidden items-center justify-between gap-2 sm:flex">
            <span className="truncate text-xs font-semibold uppercase tracking-wider text-slate-500">
              {product.brand ?? "NSM Select"}
            </span>
            {product.freeShipping && (
              <span className="shrink-0 text-xs font-bold text-emerald-700">ENVIO GRÁTIS</span>
            )}
          </div>
        )}

        {/* `-my-1 py-1`: com o título numa só linha o link tinha 18px de altura. */}
        <Link href={`/produto/${product.slug}`} className="group/title -my-1 py-1">
          <h3
            className={cn(
              "text-xs font-semibold leading-snug text-slate-800 transition group-hover/title:text-primary-700",
              dealLayout ? "line-clamp-1" : "line-clamp-1 sm:line-clamp-2",
            )}
          >
            {product.name}
          </h3>
        </Link>

        {/* Indicador de stock: só no cartão completo e quando é relevante
            (esgotado ou poucas unidades) — nunca nas secções promocionais. */}
        {!noStock && (
          <div className="hidden items-center gap-1 text-xs font-semibold sm:flex">
            {out ? (
              <span className="flex items-center gap-1 text-slate-400">
                <Package className="size-3 shrink-0" aria-hidden />
                Esgotado
              </span>
            ) : product.stock <= LOW_STOCK ? (
              <span className="flex items-center gap-1 text-amber-700">
                <Package className="size-3 shrink-0" aria-hidden />
                Últimas {product.stock} unidades
              </span>
            ) : null}
          </div>
        )}

        {!hidePrice && (
          <div className="mt-auto pt-0.5">
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
              <span className="font-display text-base font-bold text-slate-900 tabular-nums">
                {format(product.price)}
              </span>
              {product.oldPrice && (
                <span className="text-[13px] font-medium text-slate-500 line-through">
                  {format(product.oldPrice)}
                </span>
              )}
            </div>
            {/* N.º de vendas — substitui o percentual. No cartão completo o
                desktop já o tem na linha de envio, por isso só aparece no
                telemóvel e nas secções promocionais. */}
            <span
              className={cn(
                "mt-0.5 block text-xs font-medium text-slate-500",
                !dealLayout && "sm:hidden",
              )}
            >
              {formatCompact(product.sold)} vendidos
            </span>
          </div>
        )}

        {/* Linha de envio (dias + vendidos): só no cartão completo — no telemóvel
            a altura é toda para a imagem e o preço. */}
        {!noShipping && (
          <div className="hidden items-center gap-1 text-xs text-slate-500 sm:flex">
            <Truck className="size-3 shrink-0 text-primary-500" aria-hidden />
            {product.deliveryDays[0]}–{product.deliveryDays[1]} dias ·{" "}
            {formatCompact(product.sold)} vendidos
          </div>
        )}
      </div>
    </article>
  );
}
