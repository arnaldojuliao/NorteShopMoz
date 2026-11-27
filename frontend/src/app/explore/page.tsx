import type { Metadata } from "next";
import { Suspense } from "react";

import { ProductListing } from "@/components/product/ProductListing";
import { repo } from "@/lib/repo";

export const metadata: Metadata = {
  title: "Explorar | NorteShopMoz",
  description:
    "Resultados de pesquisa na NorteShopMoz: eletrónica, telemóveis, casa, moda e mais.",
  alternates: { canonical: "/explore" },
  openGraph: {
    title: "Explorar | NorteShopMoz",
    description:
      "Resultados de pesquisa na NorteShopMoz: eletrónica, telemóveis, casa, moda e mais.",
  },
};

export interface ExplorePageProps {
  searchParams: Promise<{
    q?: string;
    deal?: string;
    new?: string;
    bestseller?: string;
  }>;
}

interface PageState {
  title: string;
  emptyMessage: string;
}

async function ExploreContent({ searchParams }: ExplorePageProps) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();

  // Filtros de listagem — antigos parâmetros de /procurar, agora aqui.
  // Combinam com o termo de pesquisa em vez de o ignorarem: antes
  // /explore?q=iphone&deal=1 devolvia TODAS as ofertas e escondia a pesquisa.
  const filters = {
    dealOnly: Boolean(params.deal),
    newOnly: Boolean(params.new),
    bestsellerOnly: Boolean(params.bestseller),
  };
  const flagTitle = filters.dealOnly
    ? "Ofertas especiais"
    : filters.newOnly
      ? "Novidades"
      : filters.bestsellerOnly
        ? "Mais vendidos"
        : null;
  const flagEmpty = filters.dealOnly
    ? "Sem ofertas ativas neste momento."
    : filters.newOnly
      ? "Ainda não há novidades para mostrar."
      : "Ainda não há vendas suficientes para este ranking.";

  if (query) {
    return (
      <ListingView
        state={{
          title: flagTitle ? `${flagTitle}: “${query}”` : `Resultados para “${query}”`,
          emptyMessage: "",
        }}
        products={await repo.search(query, filters)}
        query={query}
      />
    );
  }

  if (flagTitle) {
    return (
      <ListingView
        state={{ title: flagTitle, emptyMessage: flagEmpty }}
        products={await repo.getProducts(filters)}
      />
    );
  }

  // Sem termo de pesquisa mostra-se o catálogo completo. Antes disto a página
  // era só um ícone e uma frase — e é o destino do botão «Filtrar e procurar»
  // da home, que aterrava numa página praticamente vazia.
  return (
    <ListingView
      state={{
        title: "Explorar produtos",
        emptyMessage: "Ainda não há produtos no catálogo.",
      }}
      products={await repo.getProducts()}
    />
  );
}

function ListingView({
  state,
  products,
  query,
}: {
  state: PageState;
  products: Awaited<ReturnType<typeof repo.search>>;
  /** Termo de pesquisa: define o estado vazio orientado à pesquisa. */
  query?: string;
}) {
  return (
    <div className="container-nsm py-5">
      {/* Título e contagem saíram do ecrã (a pedido): o h1 continua estrutural
          (SEO/leitores de ecrã), invisível. */}
      <h1 className="sr-only">{state.title}</h1>
      <p className="sr-only">
        {products.length} {products.length === 1 ? "produto disponível" : "produtos disponíveis"}
      </p>

      <div className="mt-6">
        {products.length > 0 ? (
          <ProductListing products={products} />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-12 text-center">
            <p className="font-medium text-slate-900">
              {query
                ? `Nenhum produto corresponde a “${query}”.`
                : state.emptyMessage || "Nenhum produto encontrado."}
            </p>
            {query ? (
              <p className="mt-1 text-sm text-slate-500">
                Experimente termos mais gerais, como &ldquo;smartphone&rdquo; ou
                &ldquo;TV&rdquo;.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExplorePage({ searchParams }: ExplorePageProps) {
  return (
    <Suspense fallback={null}>
      <ExploreContent searchParams={searchParams} />
    </Suspense>
  );
}
