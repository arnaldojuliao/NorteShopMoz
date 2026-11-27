"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/types";
import { ProductCard } from "@/components/product/ProductCard";
import { cn } from "@/lib/utils";

const INITIAL_COUNT = 12;
const LOAD_MORE_COUNT = 12;

/**
 * Proporções de imagem que alternam no mosaico — são elas que fazem as
 * alturas dos cartões variar (as imagens usam `object-cover`, logo nunca
 * deformam). O padrão repete-se a cada 4 produtos.
 */
const ASPECTS = ["aspect-[5/4]", "aspect-square", "aspect-[4/5]", "aspect-square"];

/**
 * Modo de grelha por largura de ecrã: no DESKTOP (≥768px, breakpoint `md`)
 * volta a grelha uniforme antiga; abaixo, o mosaico com `cols` colunas.
 */
function useLayoutMode() {
  const [mode, setMode] = useState({ cols: 2, wide: false });
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      setMode({ cols: 2, wide: w >= 768 });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return mode;
}

/**
 * Grelha de produtos com dois modos:
 *
 * - **Telemóvel (<768px)**: mosaico assimétrico (masonry real) —
 *
 * - Os produtos distribuem-se em N colunas INDEPENDENTES (round-robin), cada
 *   uma um `flex flex-col` — a distribuição vertical é por coluna, sem
 *   posicionamento absoluto: impossível haver sobreposições, e os cartões
 *   simplesmente empilham conforme a sua altura real.
 * - As proporções de imagem alternam (ASPECTS), por isso as alturas variam e
 *   as colunas ficam desfasadas — o efeito de mosaico do desenho de
 *   referência. No telemóvel a 2.ª coluna começa mais abaixo (max-sm:mt-6).
 * - 2 colunas no telemóvel, 3 no tablet, 4-5 no computador (useColumnCount).
 * - Carregamento progressivo: mostra `INITIAL_COUNT` cartões e revela mais
 *   `LOAD_MORE_COUNT` sempre que o fundo chega ao ecrã (IntersectionObserver),
 *   até ao último produto. A distribuição é por índice, por isso acrescentar
 *   um lote não move os cartões anteriores de coluna. Lotes pequenos evitam
 *   renderizar (e descarregar imagens de) 100 produtos de uma só vez.
 */
export function ProductGrid({
  products,
  className,
}: {
  products: Product[];
  className?: string;
}) {
  const [count, setCount] = useState(() => Math.min(INITIAL_COUNT, products.length));
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const { cols, wide } = useLayoutMode();

  // Lista nova (outra categoria, outros filtros, favoritos alterados) → volta ao
  // primeiro lote, em vez de manter o índice antigo sobre dados diferentes.
  useEffect(() => {
    const first = Math.min(INITIAL_COUNT, products.length);
    // queueMicrotask: não disparar setState de forma síncrona dentro do efeito
    // (mesma convenção de useLocalStorageState/useAsyncData).
    queueMicrotask(() => setCount(first));
  }, [products.length]);

  const hasMore = count < products.length;

  // Updater funcional: dois disparos seguidos (deslize rápido, observador
  // recriado) avançam o índice a partir do valor atual.
  const loadMore = useCallback(() => {
    setCount((c) => Math.min(c + LOAD_MORE_COUNT, products.length));
  }, [products.length]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      // 240px de avanço: o lote seguinte já cá está quando o utilizador chega
      // ao fim, sem esperar por um novo gesto de deslize.
      { threshold: 0.1, rootMargin: "0px 0px 240px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // `count`: recria o observador após cada lote, para continuar a carregar
    // enquanto o fundo se mantiver dentro da margem.
  }, [hasMore, loadMore, count]);

  const visible = products.slice(0, count);

  // Distribuição round-robin: a ordem de leitura continua a ser
  // aproximadamente linha a linha e as colunas ficam equilibradas.
  const columns: { product: Product; aspect: string; index: number }[][] = Array.from(
    { length: cols },
    () => [],
  );
  visible.forEach((product, i) => {
    columns[i % cols].push({ product, aspect: ASPECTS[i % ASPECTS.length], index: i });
  });

  return (
    <section>
      {/* Os cartões usam h3; sem um h2 de secção a hierarquia saltava de h1
          para h3 nas páginas que só têm a grelha (procurar, favoritos,
          categoria). Fica fora do ecrã para não competir com o título da
          secção nas páginas que já têm um (a home). */}
      <h2 className="sr-only">Produtos</h2>
      {wide ? (
        /* Desktop (≥md): grelha uniforme antiga — 3/4/5 colunas. */
        <div
          className={cn(
            "grid gap-2.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
            className,
          )}
        >
          {visible.map((p, i) => (
            <ProductCard key={p.id} product={p} eager={i < 4} />
          ))}
        </div>
      ) : (
        /* Telemóvel: mosaico — colunas independentes, alturas variadas. */
        <div className={cn("flex gap-2", className)}>
          {columns.map((column, ci) => (
            <div
              key={ci}
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-2",
                // Mosaico: a 2.ª coluna arranca mais abaixo.
                ci % 2 === 1 && "mt-6",
              )}
            >
              {column.map(({ product, aspect, index }) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  eager={index < 4}
                  imageAspect={aspect}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Sentinela do carregamento progressivo (invisível; o lote seguinte é
          pré-carregado automaticamente ao aproximar-se do fim). */}
      {hasMore && <div ref={loadMoreRef} className="h-1" />}
    </section>
  );
}
