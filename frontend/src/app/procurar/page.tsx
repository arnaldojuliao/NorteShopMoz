import type { Metadata } from "next";
import { Suspense } from "react";
import { Search } from "lucide-react";
import { repo } from "@/lib/repo";
import { ProductListing } from "@/components/product/ProductListing";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { ProductGridSkeleton } from "@/components/ui/Skeleton";

export const metadata: Metadata = {
  title: "Procurar produtos",
  description: "Pesquise produtos na NorteShop: eletrónica, moda, casa, beleza e mais.",
};

interface PageProps {
  searchParams: Promise<{ q?: string; deal?: string; new?: string; bestseller?: string }>;
}

async function SearchContent({ searchParams }: PageProps) {
  const params = await searchParams;

  let title = "Todos os produtos";
  let products = await repo.getProducts();

  if (params.deal) {
    title = "Ofertas especiais";
    products = await repo.getProducts({ dealOnly: true });
  } else if (params.new) {
    title = "Novidades";
    products = await repo.getProducts({ newOnly: true });
  } else if (params.bestseller) {
    title = "Mais vendidos";
    products = await repo.getProducts({ bestsellerOnly: true });
  } else if (params.q) {
    title = `Resultados para “${params.q}”`;
    products = await repo.search(params.q);
  }

  return (
      <div className="container-nsm py-5">
      <Breadcrumbs items={[{ label: title }]} />
      <div className="mt-4 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <Search className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">
            {products.length} {products.length === 1 ? "produto disponível" : "produtos disponíveis"}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <ProductListing products={products} />
      </div>
    </div>
  );
}

export default function SearchPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<div className="container-nsm py-6"><ProductGridSkeleton count={8} /></div>}>
      <SearchContent searchParams={searchParams} />
    </Suspense>
  );
}
