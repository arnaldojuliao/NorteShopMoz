import type { Metadata } from "next";
import { repo } from "@/lib/repo";
import { TrustBar } from "@/components/home/TrustBar";
import { FlashDeals } from "@/components/home/FlashDeals";
import { PaymentBanner } from "@/components/home/PaymentBanner";
import { CategoryTiles } from "@/components/home/CategoryTiles";
import { ProductGrid } from "@/components/product/ProductGrid";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/ui/Reveal";
import { StoreBenefitsBanner } from "@/components/home/StoreBenefitsBanner";
import { selectFlashDeals } from "@/lib/deals";

/** Quantos produtos as ofertas relâmpago mostram (5 = uma linha no desktop). */
const FLASH_DEALS_SIZE = 5;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const catalog = await repo.getProducts();

  // As ofertas relâmpago saem do catálogo já carregado — sem pedidos extra e
  // sem produtos inventados.
  const flashDeals = selectFlashDeals(catalog, FLASH_DEALS_SIZE);

  // A secção do catálogo leva o catálogo inteiro: a grelha revela-o em lotes de
  // 8 à medida que se desliza (IntersectionObserver em ProductGrid), até ao
  // último produto. /explore continua a ser o sítio para filtrar e ordenar.

  return (
    <>
      {/* Título único da página: o conteúdo mais proeminente são agora os
          produtos, mas o h1 continua a dar contexto a leitores de ecrã e SEO. */}
      <h1 className="sr-only">
        NorteShopMoz — compras simples, seguras e acessíveis em Moçambique
      </h1>

      {/* Secção de benefícios da loja: mensagens promocionais animadas */}
      <StoreBenefitsBanner />

      {/* Barra de confiança — faixa própria logo abaixo do cabeçalho, clicável
          em toda a largura: leva aos métodos de pagamento (/pagamentos). */}
      <TrustBar />

      {/* Vitrine de marketplace: ofertas, pagamento e depois o catálogo.
          Secções compactas (`space-y`) para haver mais produtos visíveis sem
          perder legibilidade. */}
      <div className="mt-4 space-y-6 pb-2 sm:mt-7 sm:space-y-10">
        <FlashDeals products={flashDeals} />

        <PaymentBanner />

        {/* Carril visual de categorias — a navegação por categorias na home;
            enquanto esta secção está no ecrã, a faixa do cabeçalho fica oculta. */}
        <Reveal>
          <CategoryTiles />
        </Reveal>

        {/* Do nosso catálogo */}
        <Reveal className="container-nsm">
          <SectionHeader
            title="Explore os Productos"
            linkLabel="Filtrar e procurar"
            linkHref="/explore"
          />
          <ProductGrid products={catalog} />
        </Reveal>
      </div>
    </>
  );
}
