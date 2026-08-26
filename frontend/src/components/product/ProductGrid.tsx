"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Product } from "@/lib/types";
import { ProductCard } from "@/components/product/ProductCard";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const INITIAL_COUNT = 8;
const LOAD_MORE_COUNT = 8;

export function ProductGrid({
  products,
  className,
}: {
  products: Product[];
  className?: string;
}) {
  const [visibleProducts, setVisibleProducts] = useState<Product[]>(() => products.slice(0, INITIAL_COUNT));
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(() => products.length > INITIAL_COUNT);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Force reset when products prop changes by using products length in key
  // This is more React-friendly than setting state in useEffect
  const productsKey = products.length;

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    // Simulate a small delay for better UX
    setTimeout(() => {
      const nextIndex = visibleProducts.length;
      const newProducts = products.slice(nextIndex, nextIndex + LOAD_MORE_COUNT);
      
      if (newProducts.length > 0) {
        setVisibleProducts((prev) => [...prev, ...newProducts]);
      }
      
      setHasMore(nextIndex + LOAD_MORE_COUNT < products.length);
      setIsLoading(false);
    }, 300);
  }, [isLoading, hasMore, visibleProducts.length, products]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    observerRef.current = observer;

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loadMore, hasMore, isLoading]);

  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5", className)} key={productsKey}>
      {visibleProducts.map((p, i) => (
        <ProductCard key={p.id} product={p} eager={i < 4} />
      ))}

      {/* Load more trigger */}
      <div
        ref={loadMoreRef}
        className="col-span-full flex justify-center py-4"
        aria-hidden="true"
      >
        {hasMore && (
          <div className="flex items-center gap-2 text-slate-500">
            {isLoading && <Loader2 className="size-5 animate-spin text-primary-600" />}
            <span className="text-sm font-medium">
              {isLoading ? "A carregar mais..." : "Deslize para carregar mais produtos"}
            </span>
          </div>
        )}
        {!hasMore && visibleProducts.length > 0 && (
          <p className="text-sm text-slate-400 text-center">Todos os produtos carregados</p>
        )}
      </div>
    </div>
  );
}