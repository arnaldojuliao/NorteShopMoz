import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, LayoutGrid } from "lucide-react";
import { repo } from "@/lib/repo";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://norteshop.com";

export const metadata: Metadata = {
  title: "Categorias — Comprar por categoria em Moçambique",
  description:
    "Explore todas as categorias da NorteShop: eletrónicos, telemóveis, informática, casa, moda, beleza, acessórios, desporto e mais.",
};

export default async function CategoriesPage() {
  const [categories, products] = await Promise.all([
    repo.getCategories(),
    repo.getProducts(),
  ]);

  // Contagem de produtos por categoria (a partir do catálogo completo).
  const counts = new Map<string, number>();
  for (const p of products) {
    counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  }

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Categorias — NorteShop",
    url: `${SITE_URL}/categorias`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: categories.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        url: `${SITE_URL}/categoria/${c.slug}`,
        image: c.image,
      })),
    },
  };

  return (
      <div className="container-nsm py-5">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <Breadcrumbs items={[{ label: "Categorias" }]} />

      <div className="mt-4 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <LayoutGrid className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900 sm:text-3xl">
            Comprar por categoria
          </h1>
          <p className="text-sm text-slate-500">
            {categories.length} categorias · {products.length} produtos disponíveis
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={`/categoria/${c.slug}`}
            className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            <Image
              src={c.image}
              alt={c.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-navy-950/90 via-navy-950/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3.5">
              <span className="mb-1 block text-2xl" aria-hidden>
                {c.emoji}
              </span>
              <p className="font-display text-base font-bold text-white">{c.name}</p>
              <p className="mt-0.5 line-clamp-1 text-[11px] text-white/70">{c.description}</p>
              <p className="mt-1.5 flex items-center gap-0.5 text-[11px] font-semibold text-primary-300">
                {counts.get(c.slug) ?? 0} produtos
                <ChevronRight className="size-3 transition-transform duration-300 group-hover:translate-x-0.5" />
              </p>
            </div>
          </Link>
        ))}
      </div>
        </div>
      );
}
