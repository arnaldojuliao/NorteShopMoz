import type { Order, OrderStatus } from "@/lib/types";
import { apiGet, apiPost, apiPatch, ApiError } from "@/lib/api";

/**
 * Camada de pedidos — liga o checkout e a página de conta ao backend
 * Spring Boot (POST /api/orders público — guest checkout; GET /api/orders/{id}
 * público por ID de alta entropia para acompanhar o estado sem conta).
 *
 * Fallback offline: se a API estiver indisponível, o pedido é criado
 * localmente (localStorage) com o mesmo formato — a loja nunca bloqueia.
 *
 * NOTA: Tokens JWT agora estão em cookies HttpOnly (nsm_at, nsm_rt).
 * As chamadas usam credentials: 'include' (via api.ts) — não precisamos
 * ler/escrever tokens no localStorage.
 */

const GUEST_KEY = "nsm:guest-id";
const USER_KEY = "nsm:user";

/**
 * Chave do localStorage para pedidos — inclui userId para isolar por utilizador.
 * Para guest checkout (sem login), usa chave global antiga para compatibilidade.
 */
export function getOrdersKey(userId?: string): string {
  return userId ? `nsm:orders:${userId}` : "nsm:orders";
}

/**
 * Limpa pedidos locais do utilizador atual (usado no logout).
 */
export function clearUserOrders(userId?: string): void {
  if (typeof window === "undefined") return;
  try {
    if (userId) {
      window.localStorage.removeItem(getOrdersKey(userId));
    } else {
      // Fallback: remove todas as chaves nsm:orders:*
      Object.keys(window.localStorage).forEach(key => {
        if (key.startsWith("nsm:orders:")) window.localStorage.removeItem(key);
      });
      window.localStorage.removeItem("nsm:orders");
    }
  } catch {
    /* ignora */
  }
}

// Deprecated: manter para compatibilidade com código antigo
export const ORDERS_KEY = "nsm:orders";

/**
 * Guarda dados do utilizador no localStorage (usado pelo AuthContext).
 */
export function setStoredUser(user: { email: string; name: string } | null): void {
  if (typeof window === "undefined") return;
  try {
    if (user) {
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(USER_KEY);
    }
  } catch {
    /* ignora */
  }
}

/**
 * Identidade de convidado (UUID persistente no dispositivo) — permite o carrinho
 * de quem não tem conta ser guardado no servidor (header X-Guest-Id). Cria se faltar.
 */
export function getGuestId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(GUEST_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `guest-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      window.localStorage.setItem(GUEST_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export interface OrderPayload {
  items: {
    productId: string;
    slug: string;
    name: string;
    image: string;
    price: number;
    qty: number;
    variant?: string;
  }[];
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  paymentMethod: string;
  address: {
    fullName: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    province: string;
    notes?: string;
  };
  /** Dados de pagamento online (M-Pesa/e-Mola: telefone; cartão: últimos 4 dígitos). */
  paymentInfo?: {
    phone?: string;
    cardLast4?: string;
  };
}

/**
 * Cria o pedido no backend (guest checkout).
 * - Sucesso → pedido real (totais recalculados no servidor);
 * - Erro de validação do backend (ApiError, ex.: província inválida) → re-lança;
 * - Falha de rede/timeout → fallback offline com pedido local (totais do cliente).
 *
 * `idempotencyKey` (opcional): chave única por tentativa de finalização — se o
 * mesmo pedido for enviado de novo (retry após falha de rede, duplo clique), o
 * servidor devolve o pedido já criado em vez de criar outro.
 */
export async function submitOrder(
  payload: OrderPayload,
  idempotencyKey?: string,
  extraHeaders?: Record<string, string>,
): Promise<Order> {
  try {
    const headers: Record<string, string> = { ...extraHeaders };
    // X-Guest-Id para carrinho de convidado
    const guestId = getGuestId();
    if (guestId) headers["X-Guest-Id"] = guestId;
    if (idempotencyKey && !headers["Idempotency-Key"]) headers["Idempotency-Key"] = idempotencyKey;
    // Credentials: 'include' é adicionado automaticamente por apiPost
    const { data } = await apiPost<{ data: Order }>("/api/orders", payload, headers);
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Fallback offline — pedido local (totais calculados no cliente).
    const order: Order = {
      id: `NSM-${Date.now().toString().slice(-8)}`,
      date: new Date().toISOString(),
      items: payload.items,
      subtotal: payload.subtotal,
      shipping: payload.shipping,
      discount: payload.discount,
      total: payload.total,
      status: "Pedido recebido" as OrderStatus,
      address: payload.address,
      paymentMethod: payload.paymentMethod,
    };
    return order;
  }
}

/** Estado real do pedido (lookup público por ID). null se indisponível/inexistente. */
export async function fetchOrderStatus(id: string): Promise<Order | null> {
  try {
    // TTL curto (60s) para o estado refletir atualizações do backend com frescor.
    const { data } = await apiGet<{ data: Order }>(`/api/orders/${encodeURIComponent(id)}`);
    return data;
  } catch {
    return null;
  }
}

/**
 * Pedido para a página pública de acompanhamento (link do email).
 * Com sessão ativa (cookie HttpOnly), o backend associa à conta;
 * sem sessão, o lookup público por ID cobre os guest checkouts.
 */
export async function fetchOrderTracking(id: string): Promise<Order | null> {
  try {
    const { data } = await apiGet<{ data: Order }>(
      `/api/orders/${encodeURIComponent(id)}`,
      60_000,
      false,
    );
    return data;
  } catch {
    return null;
  }
}

/**
 * Pedidos do utilizador autenticado (GET /api/orders com cookie HttpOnly).
 * null em falha de rede/sessão — o chamador decide o fallback.
 */
export async function fetchMyOrders(): Promise<Order[] | null> {
  try {
    // Sem cache (dados pessoais) — cookies HttpOnly enviados automaticamente
    const { data } = await apiGet<{ data: Order[] }>("/api/orders", 0, true);
    return data;
  } catch {
    return null;
  }
}

/**
 * Lista todos os pedidos (admin) via proxy same-origin com cookie HttpOnly.
 * Lança ApiError (401/403/400) — a página de admin decide como reagir.
 */
export async function listAdminOrders(status?: OrderStatus | ""): Promise<Order[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8081"}/api/admin/orders${query}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, `[${res.status}] ${body?.error ?? "Erro ao carregar pedidos"}`);
  }
  const { data } = (await res.json()) as { data: Order[] };
  return data;
}

/**
 * Avança o estado do pedido (admin) via PATCH /api/orders/{id}/status.
 * Re-lança ApiError — a página mostra a mensagem do backend.
 */
export async function advanceOrderStatus(id: string, nextStatus: OrderStatus): Promise<Order> {
  const res = await apiPatch<{ data: Order }>(
    `/api/orders/${encodeURIComponent(id)}/status`,
    { status: nextStatus },
  );
  return res.data;
}

function getLocalOrders(userId?: string): Order[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(getOrdersKey(userId)) ?? "[]") as Order[];
  } catch {
    return [];
  }
}

/**
 * Guarda um pedido no topo da lista local (dedup por id). Com `userId`,
 * escreve na chave isolada por utilizador (nsm:orders:{userId}); sem,
 * usa a chave global de convidado.
 */
export function saveLocalOrder(order: Order, userId?: string): Order[] {
  if (typeof window === "undefined") return getLocalOrders(userId);
  const existing = getLocalOrders(userId).filter((o) => o.id !== order.id);
  const next = [order, ...existing];
  window.localStorage.setItem(getOrdersKey(userId), JSON.stringify(next));
  return next;
}