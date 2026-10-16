import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { repo } from "@/lib/repo";
import CategoryPageClient from "./CategoryPageClient";
import { isValidImageSrc, serializeJsonLd } from "@/lib/utils";
import { site } from "@/config/site";
import { envOr } from "@/lib/env";

const SITE_URL = envOr(process.env.NEXT_PUBLIC_SITE_URL, site.url);

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const categories = await repo.getCategories();
  return categories.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await repo.getCategory(slug);
  if (!category) return { title: "Categoria não encontrada" };
  const ogImage = isValidImageSrc(category.image)
    ? [{ url: category.image, width: 800, height: 600 }]
    : undefined;
  return {
    title: `${category.name} — Comprar online em Moçambique`,
    description: `${category.description} Compre ${category.name.toLowerCase()} online na NorteShopMoz com entrega para todo Moçambique.`,
    openGraph: {
      title: `${category.name} · NorteShopMoz`,
      description: category.description,
      ...(ogImage ? { images: ogImage } : {}),
    },
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const category = await repo.getCategory(slug);
  if (!category) notFound();

  const [products, categories] = await Promise.all([
    repo.getCategoryProducts(slug),
    repo.getCategories(),
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `${category.name} — Comprar online em Moçambique`,
            description: category.description,
            url: `${SITE_URL}/categoria/${category.slug}`,
            mainEntity: {
              "@type": "ItemList",
              itemListElement: products.slice(0, 30).map((p, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: p.name,
                url: `${SITE_URL}/produto/${p.slug}`,
                ...(isValidImageSrc(p.images[0]) ? { image: p.images[0] } : {}),
                offers: {
                  "@type": "Offer",
                  priceCurrency: "MZN",
                  price: p.price,
                },
              })),
            },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Início", item: SITE_URL },
              {
                "@type": "ListItem",
                position: 2,
                name: category.name,
                item: `${SITE_URL}/categoria/${category.slug}`,
              },
            ],
          }),
        }}
      />
      <CategoryPageClient
        initialCategory={category}
        initialProducts={products}
        initialCategories={categories}
      />
    </>
  );
}