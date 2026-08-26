import { NextResponse } from "next/server";
import { repo } from "@/lib/repo";

interface RouteCtx {
  params: Promise<{ slug: string }>;
}

/** GET /api/products/:slug */
export async function GET(_request: Request, { params }: RouteCtx) {
  const { slug } = await params;
  const product = await repo.getProduct(slug);
  if (!product) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }
  return NextResponse.json({ data: product });
}
