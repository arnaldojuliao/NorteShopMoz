import type { MetadataRoute } from "next";
import { repo } from "@/lib/repo";
import { site } from "@/config/site";




export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: site.url, changeFrequency: "daily", priority: 1 },
    { url: `${site.url}/procurar`, changeFrequency: "daily", priority: 0.8 },
    { url: `${site.url}/categorias`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${site.url}/sobre`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${site.url}/ajuda`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${site.url}/contactos`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${site.url}/entregas`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${site.url}/devolucoes`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${site.url}/termos`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${site.url}/privacidade`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const [categories, products] = await Promise.all([repo.getCategories(), repo.getProducts()]);

  const categoryRoutes = categories.map((c) => ({
    url: `${site.url}/categoria/${c.slug}`,
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  const productRoutes = products.map((p) => ({
    url: `${site.url}/produto/${p.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
