import { NextResponse, type NextRequest } from "next/server";
import type { Product } from "@/lib/types";
import { apiGet } from "@/lib/api";
import { productsPath, repo, type ProductQuery } from "@/lib/repo";

/**
 * GET /api/products
 * Proxy same-origin para o backend Spring Boot (contrato { data, meta }):
 * tenta primeiro a API real; se estiver indisponível, cai para o catálogo local.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const query: ProductQuery = {
    category: sp.get("category") ?? undefined,
    q: sp.get("q") ?? undefined,
    sort: (sp.get("sort") as ProductQuery["sort"]) ?? undefined,
    featuredOnly: sp.get("featured") === "1",
    bestsellerOnly: sp.get("bestseller") === "1",
    newOnly: sp.get("new") === "1",
    dealOnly: sp.get("deal") === "1",
    minPrice: sp.get("minPrice") ? Number(sp.get("minPrice")) : undefined,
    maxPrice: sp.get("maxPrice") ? Number(sp.get("maxPrice")) : undefined,
    limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
  };

  try {
    // Contrato exato do backend (meta.total = total de correspondências, mesmo com limit)
    const envelope = await apiGet<{ data: Product[]; meta?: { total?: number } }>(productsPath(query));
    return NextResponse.json(envelope);
  } catch {
    const data = await repo.getProducts(query);
    return NextResponse.json({ data, meta: { total: data.length } });
  }
}
