"use client";

import { SearchX } from "lucide-react";
import type { Product } from "@/lib/types";
import { ProductGrid } from "@/components/product/ProductGrid";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Listagem de produtos das páginas de categoria/explore.
 *
 * A barra de controlos (contador de produtos, filtro de preço e ordenação
 * «Relevância/Mais vendidos/…») saiu a pedido: a listagem é agora só a grelha.
 */
export function ProductListing({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="Nenhum produto encontrado"
        description="Tente outra pesquisa ou explore as categorias da loja."
        actionLabel="Ver todos os produtos"
        actionHref="/explore"
      />
    );
  }

  return <ProductGrid products={products} />;
}
