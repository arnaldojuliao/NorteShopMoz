import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { repo } from "@/lib/repo";
import { formatMZN } from "@/lib/format";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/ui/Reveal";
import { ProductGallery } from "@/components/product/ProductGallery";
import { BuyBox } from "@/components/product/BuyBox";
import { ProductTabs } from "@/components/product/ProductTabs";
import { ProductGrid } from "@/components/product/ProductGrid";
import { isValidImageSrc, serializeJsonLd } from "@/lib/utils";
import { site } from "@/config/site";
import { envOr } from "@/lib/env";

const SITE_URL = envOr(process.env.NEXT_PUBLIC_SITE_URL, site.url);

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const products = await repo.getProducts();
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await repo.getProduct(slug);
  if (!product) return { title: "Produto não encontrado" };

  // Só emite openGraph.images com uma imagem válida (URLs relativas rebentam
  // a resolução de metadados do Next).
  const ogImage = product.images.find(isValidImageSrc);
  return {
    title: product.name,
    description: product.shortDescription,
    openGraph: {
      title: `${product.name} — NorteShopMoz`,
      description: product.shortDescription,
      type: "website",
      ...(ogImage
        ? { images: [{ url: ogImage, width: 800, height: 800, alt: product.name }] }
        : {}),
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await repo.getProduct(slug);
  if (!product) notFound();

  const related = await repo.getRelated(product);
  const category = await repo.getCategory(product.category);

  const validImages = product.images.filter(isValidImageSrc);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription,
    ...(validImages.length ? { image: validImages } : {}),
    brand: { "@type": "Brand", name: product.brand ?? "NorteShopMoz" },
    sku: product.id,
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/produto/${product.slug}`,
      priceCurrency: "MZN",
      price: product.price,
      availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "NorteShopMoz" },
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      reviewCount: product.ratingCount,
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Início", item: SITE_URL },
      ...(category
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: category.name,
              item: `${SITE_URL}/categoria/${category.slug}`,
            },
          ]
        : [
            {
              "@type": "ListItem",
              position: 2,
              name: "Produtos",
              item: `${SITE_URL}/explore`,
            },
          ]),
      {
        "@type": "ListItem",
        position: category ? 3 : 2,
        name: product.name,
        item: `${SITE_URL}/produto/${product.slug}`,
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
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <Breadcrumbs
        items={[
          { label: category?.name ?? "Produtos", href: category ? `/categoria/${category.slug}` : "/explore" },
          { label: product.name },
        ]}
      />

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:gap-12">
        <ProductGallery product={product} />
        <BuyBox product={product} />
      </div>

      <ProductTabs product={product} />

      <Reveal className="mt-14">
        <SectionHeader
          title="Você também pode gostar"
          subtitle="Produtos relacionados com a sua escolha"
        />
        <ProductGrid products={related} />
      </Reveal>

      <p className="mt-10 rounded-2xl bg-slate-50 p-4 text-center text-xs text-slate-500">
                Preço indicativo em Meticais (MZN). O preço final, prazos de entrega e a
                disponibilidade são confirmados no checkout. · {formatMZN(product.price)}
              </p>
    </div>
  );
}