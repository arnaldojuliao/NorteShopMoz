import { NextResponse } from "next/server";
import { ApiError, forwardedAuthHeaders } from "@/lib/api";
import { submitOrder, type OrderPayload } from "@/lib/orders";

/**
 * POST /api/orders
 * Proxy same-origin para o backend Spring Boot (POST público — guest checkout).
 * - Backend disponível → pedido real (totais recalculados no servidor);
 * - Erro de validação do backend → devolve o erro com o mesmo status;
 * - Backend indisponível → pedido local (fallback offline).
 *
 * Os headers de sessão (cookies HttpOnly, Authorization, CSRF) são encaminhados
 * via forwardedAuthHeaders: sem isto, um utilizador LOGADO que fizesse o checkout
 * através deste proxy chegava ao backend como anónimo — o pedido nascia guest
 * (sem ligação à conta) e não aparecia no histórico nem em "os meus pedidos".
 */
export async function POST(request: Request) {
  let body: OrderPayload;
  try {
    body = (await request.json()) as OrderPayload;
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  if (!body.items?.length) {
    return NextResponse.json({ error: "Pedido sem itens" }, { status: 400 });
  }
  if (!body.address?.fullName || !body.address?.phone || !body.address?.province) {
    return NextResponse.json({ error: "Dados de entrega incompletos" }, { status: 400 });
  }

  // Encaminha a sessão (cookies/Authorization/CSRF) e a chave anti duplo-submit.
  const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
  const headers: Record<string, string> = {
    ...forwardedAuthHeaders(request),
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  try {
    const order = await submitOrder(body, idempotencyKey, headers);
    return NextResponse.json({ data: order }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Não foi possível registar o pedido" }, { status: 502 });
  }
}
