import type { Badge, Category, Product } from "@/lib/types";
import { apiGet } from "@/lib/api";
import {
  bestsellers as localBestsellers,
  dealsOfToday as localDealsOfToday,
  featuredProducts as localFeatured,
  getProductBySlug,
  newArrivals as localNewArrivals,
  products as localProducts,
  searchProducts as localSearch,
} from "@/lib/data/products";
import { categories as localCategories } from "@/lib/data/categories";

/**
 * Repositório de dados — ÚNICO ponto de acesso aos dados.
 *
 * Estratégia: cada método tenta primeiro a API REST do backend Spring Boot
 * (contrato /api/*, envelope { data, meta }); se a API estiver indisponível
 * (erro de rede, timeout, HTTP >= 400) ou demorar, cai para os dados locais
 * (src/lib/data) — a loja continua a funcionar offline.
 */
export interface ProductQuery {
  category?: string;
  q?: string;
  badge?: string;
  sort?: "relevance" | "price-asc" | "price-desc" | "rating" | "sold";
  minPrice?: number;
  maxPrice?: number;
  featuredOnly?: boolean;
  bestsellerOnly?: boolean;
  newOnly?: boolean;
  dealOnly?: boolean;
  limit?: number;
}

interface ApiEnvelope<T> {
  data: T;
  meta?: { total?: number };
}

function toParams(query: ProductQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (query.category) p.set("category", query.category);
  if (query.q) p.set("q", query.q);
  if (query.sort && query.sort !== "relevance") p.set("sort", query.sort);
  if (query.featuredOnly) p.set("featured", "1");
  if (query.bestsellerOnly) p.set("bestseller", "1");
  if (query.newOnly) p.set("isNew", "1");
  if (query.dealOnly) p.set("deal", "1");
  if (query.minPrice != null) p.set("minPrice", String(query.minPrice));
  if (query.maxPrice != null) p.set("maxPrice", String(query.maxPrice));
  if (query.limit != null) p.set("limit", String(query.limit));
  return p;
}

/** Caminho da API para uma consulta (reutilizado pelo route handler de referência). */
export function productsPath(query: ProductQuery): string {
  const qs = toParams(query);
  return `/api/products${qs.size ? `?${qs}` : ""}`;
}

/** Pesquisa local (nome, marca, descrição, tags e especificações) sobre uma lista. */
function matchSearch(list: Product[], query: string): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return list.filter((p) => {
    const haystack = [
      p.name,
      p.brand ?? "",
      p.shortDescription,
      ...p.tags,
      ...p.specs.map((s) => `${s.label} ${s.value}`),
    ]
      .join(" ")
      .toLowerCase();
    return q.split(/\s+/).every((word) => haystack.includes(word));
  });
}

/** Aplica os filtros/ordenação ao catálogo local (fallback quando a API está em baixo). */
function filterLocalProducts(query: ProductQuery): Product[] {
  let list = [...localProducts];

  if (query.category) list = list.filter((p) => p.category === query.category);
  if (query.q) list = localSearch(query.q);
  if (query.featuredOnly) list = list.filter((p) => p.featured);
  if (query.bestsellerOnly) list = list.filter((p) => p.bestseller);
  if (query.newOnly) list = list.filter((p) => p.isNew);
  if (query.dealOnly) list = list.filter((p) => p.dealOfDay);
  if (query.badge) list = list.filter((p) => p.badges.includes(query.badge as Badge));
  if (query.minPrice != null) list = list.filter((p) => p.price >= query.minPrice!);
  if (query.maxPrice != null) list = list.filter((p) => p.price <= query.maxPrice!);

  switch (query.sort) {
    case "price-asc":
      list.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      list.sort((a, b) => b.price - a.price);
      break;
    case "rating":
      list.sort((a, b) => b.rating - a.rating);
      break;
    case "sold":
      list.sort((a, b) => b.sold - a.sold);
      break;
    default:
      break;
  }

  if (query.limit) list = list.slice(0, query.limit);
  return list;
}

export const repo = {
  async getCategories(): Promise<Category[]> {
    try {
      const { data } = await apiGet<ApiEnvelope<Category[]>>("/api/categories");
      return data;
    } catch {
      return localCategories;
    }
  },

  async getCategory(slug: string): Promise<Category | undefined> {
    const list = await repo.getCategories();
    return list.find((c) => c.slug === slug);
  },

  async getProducts(query: ProductQuery = {}): Promise<Product[]> {
    try {
      const { data } = await apiGet<ApiEnvelope<Product[]>>(productsPath(query));
      let list = data;
      // O backend não filtra por badge — aplica-se localmente.
      if (query.badge) list = list.filter((p) => p.badges.includes(query.badge as Badge));
      if (query.limit && list.length > query.limit) list = list.slice(0, query.limit);
      return list;
    } catch {
      return filterLocalProducts(query);
    }
  },

  async getProduct(slug: string): Promise<Product | undefined> {
    try {
      const { data } = await apiGet<ApiEnvelope<Product>>(
        `/api/products/${encodeURIComponent(slug)}`,
        5 * 60_000, // TTL maior para o detalhe (estável)
      );
      return data;
    } catch {
      return getProductBySlug(slug);
    }
  },

  async getDealsOfToday(): Promise<Product[]> {
    try {
      const { data } = await apiGet<ApiEnvelope<Product[]>>("/api/products?deal=1");
      return data;
    } catch {
      return localDealsOfToday;
    }
  },

  async getFeatured(): Promise<Product[]> {
    try {
      const { data } = await apiGet<ApiEnvelope<Product[]>>("/api/products?featured=1");
      return data;
    } catch {
      return localFeatured;
    }
  },

  async getBestsellers(): Promise<Product[]> {
    try {
      const { data } = await apiGet<ApiEnvelope<Product[]>>("/api/products?bestseller=1");
      return data;
    } catch {
      return localBestsellers;
    }
  },

  async getNewArrivals(): Promise<Product[]> {
    try {
      const { data } = await apiGet<ApiEnvelope<Product[]>>("/api/products?isNew=1");
      return data;
    } catch {
      return localNewArrivals;
    }
  },

  /** Recomendações: mesma categoria ou tags em comum (mesma lógica dos dados locais). */
  async getRelated(product: Product, limit = 8): Promise<Product[]> {
    const all = await repo.getProducts();
    const sameCategory = all.filter((p) => p.category === product.category && p.id !== product.id);
    const byTags = all
      .filter(
        (p) =>
          p.id !== product.id &&
          p.category !== product.category &&
          p.tags.some((t) => product.tags.includes(t)),
      )
      .sort((a, b) => b.sold - a.sold);
    return [...sameCategory, ...byTags].slice(0, limit);
  },

  async getCategoryProducts(slug: string): Promise<Product[]> {
    return repo.getProducts({ category: slug });
  },

  /**
   * Pesquisa com matching local (nome, marca, descrição, tags e especificações)
   * sobre a lista completa vinda da API (em cache). Garante resultados idênticos
   * com ou sem backend e cobertura maior do que a pesquisa ?q= do backend
   * (que só cobre nome/marca/descrição).
   */
  async search(query: string): Promise<Product[]> {
    const all = await repo.getProducts();
    return matchSearch(all, query);
  },
};
