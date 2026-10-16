import type { Metadata } from "next";
import { repo } from "@/lib/repo";
import CategoriesPageClient from "./CategoriesPageClient";
import { serializeJsonLd } from "@/lib/utils";
import { site } from "@/config/site";
import { envOr } from "@/lib/env";

const SITE_URL = envOr(process.env.NEXT_PUBLIC_SITE_URL, site.url);

/**
 * Categorias especiais (Todos/Novidades/Ofertas): não têm página própria —
 * usam-se apenas no menu da UI. Ficam fora do `ItemList` do JSON-LD para não
 * emitir URLs que dariam 404 (ex.: `/categoria/ofertas`).
 */
const SPECIAL_SLUGS = new Set(["todos", "novidades", "ofertas"]);

export const metadata: Metadata = {
  title: "Categorias — Comprar por categoria em Moçambique",
  description:
    "Explore todas as categorias da NorteShopMoz: eletrónicos, telemóveis, informática, casa, moda, beleza, acessórios, desporto e mais.",
};

export default async function CategoriesPage() {
  const [categories, products] = await Promise.all([
    repo.getCategories(),
    repo.getProducts(),
  ]);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Categorias — NorteShopMoz",
    url: `${SITE_URL}/categorias`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: categories
      .filter((c) => !SPECIAL_SLUGS.has(c.slug))
      .map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        url: `${SITE_URL}/categoria/${c.slug}`,
      })),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(itemListJsonLd) }}
      />
      <CategoriesPageClient
        initialCategories={categories}
        initialProducts={products}
      />
    </>
  );
}