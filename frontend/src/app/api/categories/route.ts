import { NextResponse } from "next/server";
import { repo } from "@/lib/repo";

/** GET /api/categories */
export async function GET() {
  const categories = await repo.getCategories();
  const data = await Promise.all(
    categories.map(async (c) => ({
      ...c,
      productCount: (await repo.getCategoryProducts(c.slug)).length,
    })),
  );
  return NextResponse.json({ data });
}
