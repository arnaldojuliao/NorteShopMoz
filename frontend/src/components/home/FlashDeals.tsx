import { DealSection } from "@/components/home/DealSection";
import type { Product } from "@/lib/types";

/**
 * "Ofertas Promocionais" — os produtos com oferta ativa do catálogo real (o mesmo
 * que a loja mostra), já ordenados por `selectFlashDeals`. Como a promoção é do
 * dia, a secção leva o contador até à meia-noite.
 */
export function FlashDeals({ products }: { products: Product[] }) {
  return (
    <DealSection
      id="ofertas-relampago"
      emoji="⚡"
      title="Ofertas Promocionais"
      linkHref="/explore?deal=1"
      products={products}
      countdown
      eager
    />
  );
}
