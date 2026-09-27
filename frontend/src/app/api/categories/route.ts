import { NextResponse } from "next/server";
import { repo } from "@/lib/repo";

/**
 * GET /api/categories
 * Devolve cada categoria com `productCount`. Faz uma única leitura do catálogo
 * (repo.getProducts) e conta localmente — antes fazia um pedido de produtos por
 * categoria (N+1).
 */
export async function GET() {
  const [categories, products] = await Promise.all([
    repo.getCategories(),
    repo.getProducts(),
  ]);

  const counts = new Map<string, number>();
  for (const p of products) {
    counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  }

  const data = categories.map((c) => ({
    ...c,
    productCount: counts.get(c.slug) ?? 0,
  }));

  return NextResponse.json({ data });
}
