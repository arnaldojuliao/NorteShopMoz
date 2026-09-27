import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiGet, apiPost, ApiError } from "@/lib/api";
import {
  ADMIN_ORDERS_PAGE_SIZE,
  fetchSalesStats,
  listAdminOrders,
  submitOrder,
  type AdminOrdersPage,
  type OrderPayload,
  type SalesStats,
} from "@/lib/orders";
import type { Order } from "@/lib/types";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiPost: vi.fn(), apiGet: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn() };
});

const apiPostMock = vi.mocked(apiPost) as unknown as {
  mockResolvedValue: (value: unknown) => void;
  mockRejectedValue: (error: unknown) => void;
};

const apiGetMock = vi.mocked(apiGet) as unknown as {
  mockResolvedValue: (value: unknown) => void;
  mockRejectedValue: (error: unknown) => void;
};

const payload: OrderPayload = {
  items: [
    { productId: "p-001", slug: "produto", name: "Produto", image: "img.jpg", price: 1000, qty: 1 },
  ],
  subtotal: 1000,
  shipping: 120,
  discount: 0,
  total: 1120,
  paymentMethod: "M-Pesa",
  address: {
    fullName: "Ana Teste",
    phone: "+258840000000",
    email: "ana@example.com",
    address: "Rua 1",
    city: "Maputo",
    province: "Maputo Cidade",
  },
};

const serverOrder = {
  id: "NSM-ABC123456789",
  date: new Date().toISOString(),
  items: payload.items,
  subtotal: 1000,
  shipping: 120,
  discount: 0,
  total: 1120,
  status: "Pedido recebido",
  address: payload.address,
  paymentMethod: "M-Pesa",
} as unknown as Order;

describe("submitOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devolve o pedido criado pelo servidor", async () => {
    apiPostMock.mockResolvedValue({ data: serverOrder });

    const order = await submitOrder(payload, "key-1");

    expect(order.id).toBe("NSM-ABC123456789");
    expect(apiPost).toHaveBeenCalledWith("/api/orders", payload, { "Idempotency-Key": "key-1" });
  });

  it("propaga o erro de validação devolvido pelo backend", async () => {
    apiPostMock.mockRejectedValue(new ApiError(400, "Dados de entrega incompletos"));

    await expect(submitOrder(payload)).rejects.toThrow("Dados de entrega incompletos");
  });

  /**
   * Regressão: uma falha de rede criava um pedido local com o mesmo formato
   * ("NSM-<timestamp>"), o cliente via "Pedido registado com sucesso ✅" e a
   * encomenda nunca existia no servidor. Agora tem de falhar de forma visível.
   */
  it("não inventa um pedido quando a API está inacessível", async () => {
    apiPostMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(submitOrder(payload, "key-2")).rejects.toBeInstanceOf(ApiError);
    await expect(submitOrder(payload, "key-3")).rejects.toThrow(
      /Não foi possível registar o pedido/,
    );
  });

  it("não deixa o utilizador com um pedido fantasma no histórico local", async () => {
    apiPostMock.mockRejectedValue(new TypeError("fetch failed"));

    let placedOrder: Order | null = null;
    try {
      placedOrder = await submitOrder(payload);
    } catch {
      /* o checkout mostra o erro ao cliente */
    }

    expect(placedOrder).toBeNull();
  });
});

describe("listAdminOrders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const page: AdminOrdersPage = {
    items: [serverOrder],
    page: 1,
    size: ADMIN_ORDERS_PAGE_SIZE,
    totalItems: 41,
    totalPages: 3,
    hasNext: true,
    statusCounts: { Entregue: 7, "Pedido recebido": 30 },
  };

  it("pede a página (filtro, índice e tamanho) ao servidor, sem cache", async () => {
    apiGetMock.mockResolvedValue({ data: page });

    const result = await listAdminOrders("Entregue", 1);

    expect(result).toEqual(page);
    // O servidor pagina e filtra no SQL: o filtro, a página e o tamanho têm de
    // viajar no pedido. Sem cache (0) e a ignorar a cache do processo (true).
    expect(apiGet).toHaveBeenCalledWith(
      `/api/orders/admin/all?status=${encodeURIComponent("Entregue")}&page=1&size=${ADMIN_ORDERS_PAGE_SIZE}`,
      0,
      true,
    );
  });

  it("sem filtro não envia ?status", async () => {
    apiGetMock.mockResolvedValue({ data: page });

    await listAdminOrders("", 0);

    expect(apiGet).toHaveBeenCalledWith(
      `/api/orders/admin/all?page=0&size=${ADMIN_ORDERS_PAGE_SIZE}`,
      0,
      true,
    );
  });

  it("propaga o 403 quando a conta não é administradora", async () => {
    apiGetMock.mockRejectedValue(new ApiError(403, "Sem permissões de administrador"));

    await expect(listAdminOrders()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("fetchSalesStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const stats: SalesStats = {
    totalOrders: 12,
    deliveredOrders: 7,
    cancelledOrders: 1,
    inProgressOrders: 4,
    revenue: 250000,
    shippingCollected: 3000,
    discountsGiven: 5000,
    cancelledValue: 1200,
    avgOrderValue: 20833.33,
    topProducts: [{ productId: "p-1", name: "Produto 1", revenue: 90000 }],
    days: [{ date: "2026-09-21", orders: 3, revenue: 40000 }],
  };

  it("lê as estatísticas do endpoint admin, sem cache", async () => {
    apiGetMock.mockResolvedValue({ data: stats });

    const result = await fetchSalesStats();

    expect(result).toEqual(stats);
    // Sem cache (0) e a ignorar qualquer cache do processo (true): um painel de
    // gestão não pode mostrar números antigos.
    expect(apiGet).toHaveBeenCalledWith("/api/orders/admin/stats", 0, true);
  });

  it("propaga o 403 quando a conta não é administradora", async () => {
    apiGetMock.mockRejectedValue(new ApiError(403, "Sem permissões de administrador"));

    await expect(fetchSalesStats()).rejects.toBeInstanceOf(ApiError);
  });
});
