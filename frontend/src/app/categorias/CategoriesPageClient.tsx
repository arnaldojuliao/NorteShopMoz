"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Zap, Package } from "lucide-react";
import { ProductImage } from "@/components/product/ProductImage";
import { navCategories, NAV_SPECIAL_SLUGS, type NavCategory } from "@/lib/nav-categories";
import { cn } from "@/lib/utils";
import type { Category, Product } from "@/lib/types";

interface Tile {
  key: string;
  name: string;
  image: string;
  emoji: string;
  href: string;
  hasDeals?: boolean;
}

export default function CategoriesPageClient({
  initialCategories: _initialCategories,
  initialProducts,
}: {
  initialCategories: Category[];
  initialProducts: Product[];
}) {
  // A lista estática (`navCategories`) é a fonte canónica das 17 categorias —
  // mantém a ordem e mapeia cada uma para um destino seguro (ver nota no ficheiro).
  void _initialCategories;
  const products = initialProducts;

  const [selected, setSelected] = useState<string>("todos");

  /** Slugs de catálogo (reais) com promoções — deal do dia ou preço antigo. */
  const dealSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.dealOfDay || (p.oldPrice != null && p.oldPrice > p.price)) set.add(p.category);
    }
    return set;
  }, [products]);

  const hasNew = useMemo(() => products.some((p) => p.isNew), [products]);
  const hasDeals = dealSlugs.size > 0;

  const tiles = useMemo<Tile[]>(() => {
    if (selected === "todos") {
      // Visão geral: todos os departamentos (exclui as especiais).
      return navCategories
        .filter((c) => !NAV_SPECIAL_SLUGS.has(c.slug))
        .map((d) => ({
          key: d.slug,
          name: d.name,
          image: d.image,
          emoji: d.emoji,
          href: d.primaryHref,
          hasDeals: d.catalog ? dealSlugs.has(d.catalog) : false,
        }));
    }

    if (selected === "novidades") {
      if (!hasNew) return [];
      const c = navCategories.find((n) => n.slug === "novidades") as NavCategory;
      return [
        { key: "novidades", name: "Produtos recentes", image: c.image, emoji: c.emoji, href: "/explore?new=1" },
      ];
    }

    if (selected === "ofertas") {
      if (!hasDeals) return [];
      const c = navCategories.find((n) => n.slug === "ofertas") as NavCategory;
      return [
        { key: "ofertas", name: "Produtos em oferta", image: c.image, emoji: c.emoji, href: "/explore?deal=1", hasDeals: true },
      ];
    }

    // Categoria: as suas subcategorias (tiles já trazem href seguro).
    const cat = navCategories.find((n) => n.slug === selected);
    if (!cat) return [];
    const parentHasDeals = cat.catalog ? dealSlugs.has(cat.catalog) : false;
    return cat.subcategories.map((s) => ({
      key: s.slug,
      name: s.name,
      image: s.image,
      emoji: "🛍️",
      href: s.href,
      hasDeals: parentHasDeals,
    }));
  }, [selected, dealSlugs, hasNew, hasDeals]);

  const selectedName = navCategories.find((c) => c.slug === selected)?.name ?? "Categorias";

  return (
    <div className="container-nsm py-6 pb-36 sm:pb-28 lg:py-6 lg:pb-4">
      <div className="flex gap-3 lg:gap-8">
        {/* ── Carril de categorias ─────────────────────────────────────
            Fixo (sticky) e com scroll PRÓPRIO: no mobile ocupa uma coluna
            estreita à esquerda e só ele desliza — a grelha da direita rola a
            página. A partir de `lg` alarga e passa a lista completa. */}
        <aside className="w-[92px] shrink-0 sm:w-32 md:w-40 lg:w-56">
          <nav
            aria-label="Categorias"
            className={cn(
              // Telemóvel: CARRIL FIXO — preso ao ecrã entre o header e o
              // BottomNav, sempre visível, com scroll próprio. O <aside> fica
              // como espaçoçador para o conteúdo continuar à direita.
              "max-sm:fixed max-sm:bottom-24 max-sm:left-3 max-sm:top-20 max-sm:z-40 max-sm:w-20 max-sm:overflow-y-auto max-sm:overscroll-contain",
              // Tablet: sticky com altura limitada (não passa por baixo da barra)
              "sm:sticky sm:top-2 sm:max-h-[calc(100dvh_-_9rem_-_env(safe-area-inset-bottom))] sm:overflow-y-auto sm:overscroll-contain",
              "rounded-2xl border border-slate-100 bg-slate-50/70 p-1.5 sm:p-2 lg:top-6 lg:max-h-[calc(100dvh_-_6rem)] lg:p-3",
            )}
          >
            <ul className="space-y-0.5 lg:space-y-1">
              {navCategories.map((cat) => {
                const isActive = cat.slug === selected;
                const catHasDeals = cat.slug === "ofertas" ? hasDeals : cat.catalog ? dealSlugs.has(cat.catalog) : false;
                return (
                  <li key={cat.slug}>
                    <button
                      type="button"
                      onClick={() => setSelected(cat.slug)}
                      aria-current={isActive ? "true" : undefined}
                      className={cn(
                        "relative flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-center transition-colors duration-200 lg:flex-row lg:gap-2 lg:px-3 lg:py-2.5 lg:text-left",
                        isActive
                          ? "bg-primary-50 text-primary-700 shadow-sm"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                      )}
                    >
                      <span className="text-lg leading-none lg:text-xl" aria-hidden>
                        {cat.emoji}
                      </span>
                      <span className="line-clamp-2 text-[11px] font-medium leading-tight lg:min-w-0 lg:truncate lg:text-xs">
                        {cat.name}
                      </span>
                      {catHasDeals && (
                        <Zap
                          className="absolute right-1 top-1 size-3 shrink-0 fill-danger text-danger lg:static lg:size-3.5"
                          aria-label="Tem ofertas"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        {/* ── Área principal ────────────────────────────────────────── */}
        <main className="min-w-0 flex-1">
          <div className="mb-4">
            <h1 className="font-display text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl lg:text-3xl">
              Comprar por categoria
            </h1>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              {selected === "todos"
                ? "Explore todas as categorias da loja"
                : `Subcategorias de ${selectedName}`}
            </p>
          </div>

          {tiles.length === 0 ? (
            <div className="py-12 text-center">
              <Package className="mx-auto mb-3 size-10 text-slate-300" />
              <p className="text-sm text-slate-500">
                {selected === "novidades"
                  ? "Ainda não há novidades no catálogo."
                  : selected === "ofertas"
                    ? "Sem promoções de momento."
                    : "Nenhuma subcategoria disponível."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-5 lg:grid-cols-5 xl:grid-cols-6">
              {tiles.map((tile) => (
                <Link
                  key={tile.key}
                  href={tile.href}
                  className="group flex flex-col items-center gap-2 text-center focus-visible:outline-none"
                >
                  <div className="relative w-full max-w-[7rem]">
                    <div className="relative aspect-square overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-100 transition group-hover:ring-primary-200">
                      <ProductImage
                        src={tile.image}
                        alt={tile.name}
                        fill
                        sizes="(max-width: 640px) 26vw, (max-width: 1024px) 18vw, 14vw"
                        emoji={tile.emoji}
                        label={tile.name}
                        imgClassName="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    {tile.hasDeals && (
                      <span className="absolute left-1/2 top-0 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 whitespace-nowrap rounded-full bg-danger px-1.5 py-0.5 text-xs font-bold text-white shadow-sm">
                        <Zap className="size-2.5" aria-hidden />
                        Ofertas
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 px-0.5 text-[11px] font-medium leading-snug text-slate-700 transition-colors group-hover:text-primary-700 sm:text-xs">
                    {tile.name}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
