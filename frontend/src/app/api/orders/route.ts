import { NextResponse } from "next/server";
import type { Order } from "@/lib/types";
import { apiGet, ApiError, forwardedAuthHeaders } from "@/lib/api";
import { submitOrder, type OrderPayload } from "@/lib/orders";

/**
 * GET /api/orders
 * Lista os pedidos da conta autenticada (same-origin proxy para o backend).
 *
 * Sem este handler, um GET /api/orders caía neste route handler local (que só
 * tinha POST) e o Next respondia **405 Method Not Allowed** — a página
 * «Pedidos» mostrava «Houve um problema a contactar a loja» mesmo com a API de
 * pé. As rotas de ficheiro têm prioridade sobre os rewrites do next.config.
 *
 * A sessão (cookie HttpOnly) é encaminhada; sem credenciais o backend devolve
 * 401 e o mesmo status é propagado (o chamador distingue sessão de avaria).
 */
export async function GET(request: Request) {
  const headers = forwardedAuthHeaders(request);
  if (!headers.cookie && !headers.Authorization) {
    return NextResponse.json({ error: "Autenticação necessária" }, { status: 401 });
  }
  try {
    const { data } = await apiGet<{ data: Order[] }>("/api/orders", 0, true, headers);
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Serviço de pedidos indisponível. Tente novamente em instantes." },
      { status: 503 },
    );
  }
}

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
