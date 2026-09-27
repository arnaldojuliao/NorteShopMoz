"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Product } from "@/lib/types";
import { ProductCard } from "@/components/product/ProductCard";
import { cn } from "@/lib/utils";

const INITIAL_COUNT = 8;
const LOAD_MORE_COUNT = 8;

/**
 * Grelha de produtos com carregamento progressivo: mostra `INITIAL_COUNT`
 * cartões e revela mais `LOAD_MORE_COUNT` sempre que o fundo da grelha chega ao
 * ecrã, até ao último produto da lista recebida.
 *
 * A lista completa já vem do servidor (é o mesmo catálogo que as páginas de
 * listagem pedem), por isso revelar um lote não faz nenhum pedido — é só
 * avançar um índice.
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
  // recriado) avançam o índice a partir do valor atual. Antes lia-se
  // `visibleProducts.length` do closure — dois lotes calculados sobre o mesmo
  // índice antigo acrescentavam os MESMOS produtos, o que enchia a grelha de
  // cartões repetidos e declarava a lista completa antes de mostrar tudo.
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
    // enquanto o fundo da grelha se mantiver dentro da margem.
  }, [hasMore, loadMore, count]);

  const visible = products.slice(0, count);

  return (
    <section>
      {/* Os cartões usam h3; sem um h2 de secção a hierarquia saltava de h1
          para h3 nas páginas que só têm a grelha (procurar, favoritos,
          categoria). Fica fora do ecrã para não competir com o título da
          secção nas páginas que já têm um (a home). */}
      <h2 className="sr-only">Produtos</h2>
      <div
        className={cn(
          "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
          className,
        )}
      >
        {visible.map((p, i) => (
          <ProductCard key={p.id} product={p} eager={i < 4} />
        ))}

        {/* Sentinela do carregamento progressivo */}
        <div ref={loadMoreRef} className="col-span-full flex justify-center py-4">
          {hasMore ? (
            <p className="text-sm font-medium text-slate-500">
              Continue a deslizar para ver mais produtos
            </p>
          ) : (
            visible.length > 0 && (
              <p className="text-center text-sm text-slate-400">
                Viu todos os {products.length} produtos
              </p>
            )
          )}
        </div>
      </div>
    </section>
  );
}
