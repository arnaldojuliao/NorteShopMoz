import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { repo } from "@/lib/repo";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { ProductListing } from "@/components/product/ProductListing";
import { ProductImage } from "@/components/product/ProductImage";
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
  // Só emite openGraph.images com uma imagem válida (URLs relativas rebentam
  // a resolução de metadados do Next).
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

  const products = await repo.getCategoryProducts(slug);

  const collectionJsonLd = {
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
  };

  const breadcrumbJsonLd = {
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
  };

  return (
      <div className="container-nsm py-5">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionJsonLd) }}
        />
        <Breadcrumbs items={[{ label: category.name }]} />

        {/* Banner da categoria */}
        <div className="relative mt-4 overflow-hidden rounded-2xl">
          <div className="relative aspect-[3/1] min-h-36 sm:aspect-[21/6]">
            <ProductImage
              src={category.image}
              alt={category.name}
              fill
              priority
              sizes="100vw"
              emoji={category.emoji}
              label={category.name}
              imgClassName="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-navy-950/85 via-navy-950/50 to-transparent" />
          </div>
          <div className="absolute inset-0 flex items-center">
            <div className="container-nsm">
              <span className="text-3xl" aria-hidden>
                {category.emoji}
              </span>
              <h1 className="mt-1 font-display text-2xl font-extrabold text-white sm:text-3xl">
                {category.name}
              </h1>
              <p className="mt-1 max-w-md text-sm text-white/80">{category.description}</p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <ProductListing products={products} />
        </div>
      </div>
    );
}
