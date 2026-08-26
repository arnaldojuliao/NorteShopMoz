import { NextResponse } from "next/server";
import type { Order } from "@/lib/types";
import { ApiError, apiPatch } from "@/lib/api";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/orders/:id/status
 * Proxy same-origin para a transição de estado do pedido (admin).
 * Encaminha o header Authorization — o backend valida a role ADMIN no token.
 */
export async function PATCH(request: Request, { params }: RouteCtx) {
  const { id } = await params;
  let body: { status?: string };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido" }, { status: 400 });
  }
  if (!body.status) {
    return NextResponse.json({ error: "Campo 'status' é obrigatório" }, { status: 400 });
  }
  const auth = request.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ error: "Autenticação necessária" }, { status: 401 });
  }
  try {
    const { data } = await apiPatch<{ data: Order }>(
      `/api/orders/${encodeURIComponent(id)}/status`,
      { status: body.status },
      { Authorization: auth },
    );
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof ApiError) {
      // Erro real do backend: 400 (recuar/inválido), 403, 404, etc.
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // Falha de rede/timeout (backend em baixo) — não é um pedido inexistente.
    return NextResponse.json(
      { error: "Serviço de pedidos indisponível. Tente novamente em instantes." },
      { status: 503 },
    );
  }
}
