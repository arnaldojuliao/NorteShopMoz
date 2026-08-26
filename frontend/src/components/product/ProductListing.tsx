"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, SearchX } from "lucide-react";
import type { Product } from "@/lib/types";
import { ProductGrid } from "@/components/product/ProductGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Input";

const SORTS = [
  { value: "relevance", label: "Relevância" },
  { value: "sold", label: "Mais vendidos" },
  { value: "rating", label: "Melhor avaliação" },
  { value: "price-asc", label: "Preço: menor para maior" },
  { value: "price-desc", label: "Preço: maior para menor" },
] as const;

export function ProductListing({ products }: { products: Product[] }) {
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("relevance");
  const [maxPrice, setMaxPrice] = useState<number>(0);

  const priceCaps = useMemo(() => {
    const prices = products.map((p) => p.price).sort((a, b) => a - b);
    const cap = Math.ceil((prices[prices.length - 1] ?? 50000) / 5000) * 5000;
    return cap;
  }, [products]);

  const filtered = useMemo(() => {
    let list = [...products];
    if (maxPrice > 0) list = list.filter((p) => p.price <= maxPrice);
    switch (sort) {
      case "price-asc":
        list.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        list.sort((a, b) => b.price - a.price);
        break;
      case "rating":
        list.sort((a, b) => b.rating - a.rating);
        break;
      case "sold":
        list.sort((a, b) => b.sold - a.sold);
        break;
    }
    return list;
  }, [products, sort, maxPrice]);

  if (products.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="Nenhum produto encontrado"
        description="Tente outra pesquisa ou explore as categorias da loja."
        actionLabel="Ver todos os produtos"
        actionHref="/procurar"
      />
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          <strong className="font-semibold text-slate-800">{filtered.length}</strong>{" "}
          {filtered.length === 1 ? "produto" : "produtos"}
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <label htmlFor="max-price" className="flex items-center gap-2 text-sm text-slate-600">
            Até
            <select
              id="max-price"
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none"
            >
              <option value={0}>Qualquer preço</option>
              {[1000, 2500, 5000, 10000, 20000, priceCaps].map((v) => (
                <option key={v} value={v}>
                  {v.toLocaleString("pt-MZ").replace(/\s/g, ".")} MT
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="size-4 text-slate-400" aria-hidden />
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as (typeof SORTS)[number]["value"])}
              aria-label="Ordenar produtos"
              className="h-9! w-48 rounded-lg text-sm"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <ProductGrid products={filtered} />
    </div>
  );
}
