import { repo } from "@/lib/repo";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { TrustBar } from "@/components/home/TrustBar";
import { DailyDeals } from "@/components/home/DailyDeals";
import { Newsletter } from "@/components/home/Newsletter";
import { ProductGrid } from "@/components/product/ProductGrid";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/ui/Reveal";

export default async function HomePage() {
  const [deals, catalog] = await Promise.all([
    repo.getDealsOfToday(),
    repo.getProducts(),
  ]);

  // A secção do catálogo leva o catálogo inteiro: a grelha revela-o em lotes de
  // 8 à medida que se desliza (IntersectionObserver em ProductGrid), até ao
  // último produto. /explore continua a ser o sítio para filtrar e ordenar.

  return (
    <>
      {/* Título único da página. Fica visível só para leitores de ecrã: o
          elemento mais proeminente é o hero, cujo título muda a cada slide
          (um h1 rotativo seria pior para SEO). */}
      <h1 className="sr-only">
        NorteShopMoz — compras simples, seguras e acessíveis em Moçambique
      </h1>

      {/* Hero / banner principal — largura total, altura fixa de 400px */}
      <section className="pt-3 sm:pt-5">
        <HeroCarousel />
      </section>

      {/* Barra de benefícios */}
      <TrustBar />

      {/* Ofertas de hoje + Você também pode gostar */}
      <section className="mt-10 space-y-12">
        <DailyDeals deals={deals} />

        {/* Você também pode gostar */}
        <Reveal className="container-nsm">
          <SectionHeader
            title="Do nosso catálogo"
            subtitle="Tudo o que temos na loja  continue a deslizar para ver mais"
            linkLabel="Filtrar e procurar"
            linkHref="/explore"
          />
          <ProductGrid products={catalog} />
        </Reveal>
      </section>

      {/* Newsletter - apenas desktop */}
      <div className="hidden lg:block">
        <Newsletter />
      </div>
    </>
  );
}
