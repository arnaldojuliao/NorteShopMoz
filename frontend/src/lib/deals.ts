import type { Product } from "@/lib/types";
import { discountPct } from "@/lib/format";

/**
 * Seleção da faixa promocional da homepage.
 *
 * A secção não guarda produtos próprios: escolhe-os do catálogo real (o mesmo
 * que alimenta /explore e as categorias), pelo que nunca há dados falsos nem
 * descontos inventados — se um produto não tiver preço antigo, aparece com 0%
 * de desconto.
 */

/** Percentagem de desconto real do produto (0 se não tiver preço antigo). */
export function discountOf(product: Product): number {
  return product.oldPrice ? discountPct(product.oldPrice, product.price) : 0;
}

/**
 * Ofertas relâmpago: primeiro as ofertas do dia (`dealOfDay`) e, dentro de cada
 * grupo, o maior desconto real; `sold` desempata. Se o catálogo não tiver
 * descontos, devolve os mais vendidos em vez de uma secção vazia.
 */
export function selectFlashDeals(products: Product[], limit = 6): Product[] {
  return [...products]
    .sort(
      (a, b) =>
        Number(Boolean(b.dealOfDay)) - Number(Boolean(a.dealOfDay)) ||
        discountOf(b) - discountOf(a) ||
        b.sold - a.sold ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}
