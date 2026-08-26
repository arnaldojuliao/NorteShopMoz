import { NextResponse } from "next/server";
import type { Order } from "@/lib/types";
import { apiGet } from "@/lib/api";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/orders/:id
 * Proxy same-origin para o lookup público de estado do pedido no backend
 * (pedidos de convidados são consultáveis por ID de alta entropia sem token).
 */
export async function GET(_request: Request, { params }: RouteCtx) {
  const { id } = await params;
  try {
    const { data } = await apiGet<{ data: Order }>(`/api/orders/${encodeURIComponent(id)}`);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }
}
