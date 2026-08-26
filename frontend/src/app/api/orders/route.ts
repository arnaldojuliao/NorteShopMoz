import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api";
import { submitOrder, type OrderPayload } from "@/lib/orders";

/**
 * POST /api/orders
 * Proxy same-origin para o backend Spring Boot (POST público — guest checkout).
 * - Backend disponível → pedido real (totais recalculados no servidor);
 * - Erro de validação do backend → devolve o erro com o mesmo status;
 * - Backend indisponível → pedido local (fallback offline).
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

  // Encaminha os headers de sessão/idempotência para o backend: sem isto, um
  // pedido enviado pelo proxy same-origin perderia o token (ligação à conta)
  // e a chave anti duplo-submit (Idempotency-Key).
  const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
  const auth = request.headers.get("authorization");
  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = auth;
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
