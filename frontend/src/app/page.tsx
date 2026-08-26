import { repo } from "@/lib/repo";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { TrustBar } from "@/components/home/TrustBar";
import { DailyDeals } from "@/components/home/DailyDeals";
import { Newsletter } from "@/components/home/Newsletter";
import { ProductGrid } from "@/components/product/ProductGrid";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/ui/Reveal";

export default async function HomePage() {
  const [deals, allProducts] = await Promise.all([
    repo.getDealsOfToday(),
    repo.getProducts(),
  ]);

  return (
    <>
      {/* Hero / banner principal — largura total, altura fixa de 400px */}
      <section className="pt-3 sm:pt-5">
        <HeroCarousel />
      </section>

      {/* Barra de benefícios */}
      <TrustBar />

      {/* Ofertas de hoje + Você também pode gostar */}
      <section className="mt-10 space-y-14">
        <DailyDeals deals={deals} />

        {/* Você também pode gostar */}
        <Reveal className="container-nsm">
          <SectionHeader
            title="Você também pode gostar"
            subtitle="Todos os produtos disponíveis na NorteShop"
          />
          <ProductGrid products={allProducts} />
        </Reveal>
      </section>

      {/* Newsletter - apenas desktop */}
      <div className="hidden lg:block">
        <Newsletter />
      </div>
    </>
  );
}
