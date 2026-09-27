import { NextResponse, type NextRequest } from "next/server";
import type { Product } from "@/lib/types";
import { apiGet } from "@/lib/api";
import { productsPath, isTestProduct, repo, type ProductQuery } from "@/lib/repo";

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
    // Mesmo filtro de dados de teste do repo — este endpoint é público.
    let data = envelope.data.filter((p) => !isTestProduct(p));
    // O corte do backend pode ser gasto em produtos ocultos (a ordem é do mais
    // recente para o mais antigo e os de teste foram os últimos criados): se o
    // lote filtrado não chegou ao pedido, busca-se o catálogo todo e corta-se aqui.
    if (query.limit && data.length < query.limit) {
      const all = await apiGet<{ data: Product[]; meta?: { total?: number } }>(
        productsPath({ ...query, limit: undefined }),
      );
      data = all.data.filter((p) => !isTestProduct(p));
      if (data.length > query.limit) data = data.slice(0, query.limit);
    }
    return NextResponse.json({
      data,
      meta: { ...envelope.meta, total: data.length },
    });
  } catch (err) {
    // Sinal EXPLÍCITO de degradação: a API não respondeu e estamos a servir o
    // catálogo empacotado no build. Sem isto a loja parecia normal — com preços
    // e stock desatualizados — e a avaria só se descobria por reclamação.
    console.warn(
      `[catalog] API indisponível — a servir catálogo local (fallback): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    const data = await repo.getProducts(query);
    return NextResponse.json(
      { data, meta: { total: data.length, degraded: true } },
      { headers: { "X-NSM-Data-Source": "local-fallback" } },
    );
  }
}
