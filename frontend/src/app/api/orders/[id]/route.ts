import { NextResponse } from "next/server";
import type { Order } from "@/lib/types";
import { apiGet, forwardedAuthHeaders } from "@/lib/api";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/orders/:id
 * Proxy same-origin para o lookup de estado do pedido no backend (pedidos de
 * convidados são consultáveis por ID de alta entropia sem token).
 *
 * Os cookies são encaminhados e a cache da API é ignorada: sem isso um pedido
 * autenticado era tratado como anónimo (404) e uma resposta podia ser servida
 * da cache partilhada do processo do Next.
 *
 * O `email` (prova de contacto dos pedidos de convidado) é reencaminhado tal e
 * qual para o backend.
 */
export async function GET(request: Request, { params }: RouteCtx) {
  const { id } = await params;
  const email = new URL(request.url).searchParams.get("email");
  try {
    const { data } = await apiGet<{ data: Order }>(
      `/api/orders/${encodeURIComponent(id)}${email ? `?email=${encodeURIComponent(email)}` : ""}`,
      0,
      true,
      forwardedAuthHeaders(request),
    );
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }
}
