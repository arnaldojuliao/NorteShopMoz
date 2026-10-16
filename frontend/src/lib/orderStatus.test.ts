import { describe, expect, it } from "vitest";
import type { Order, OrderStatus } from "@/lib/types";
import {
  canCancelOrder,
  canRequestReturn,
  ORDER_TABS,
  orderMatchesTab,
  RETURN_WINDOW_DAYS,
  tabCounts,
} from "./orderStatus";

const DAY = 86_400_000;

function makeOrder(id: string, status: OrderStatus, daysAgo = 1): Order {
  return {
    id,
    date: new Date(Date.now() - daysAgo * DAY).toISOString(),
    items: [],
    subtotal: 0,
    shipping: 0,
    discount: 0,
    total: 0,
    status,
    address: {
      fullName: "Cliente",
      phone: "+258840000000",
      email: "cliente@test.com",
      address: "Rua 1",
      city: "Maputo",
      province: "Maputo",
    },
    paymentMethod: "Pagamento na entrega",
  };
}

const tab = (id: string) => ORDER_TABS.find((t) => t.id === id)!;

describe("separadores de pedidos", () => {
  it("tem os separadores pedidos, por esta ordem", () => {
    expect(ORDER_TABS.map((t) => t.label)).toEqual([
      "Todos",
      "A processar",
      "Enviados",
      "Entregues",
      "Cancelados",
      "Devoluções",
    ]);
  });

  it("«Todos» mostra qualquer estado e os restantes filtram pelos reais", () => {
    const inProgress = makeOrder("o1", "Em preparação");
    const shipped = makeOrder("o2", "Enviado");
    const inTransit = makeOrder("o3", "Em trânsito");
    const delivered = makeOrder("o4", "Entregue");
    const cancelled = makeOrder("o5", "Cancelado");

    for (const o of [inProgress, shipped, inTransit, delivered, cancelled]) {
      expect(orderMatchesTab(o, tab("todos"))).toBe(true);
    }
    expect(orderMatchesTab(inProgress, tab("a-processar"))).toBe(true);
    expect(orderMatchesTab(delivered, tab("a-processar"))).toBe(false);
    expect(orderMatchesTab(shipped, tab("enviados"))).toBe(true);
    expect(orderMatchesTab(inTransit, tab("enviados"))).toBe(true);
    expect(orderMatchesTab(inProgress, tab("enviados"))).toBe(false);
    expect(orderMatchesTab(cancelled, tab("cancelados"))).toBe(true);
    expect(orderMatchesTab(delivered, tab("cancelados"))).toBe(false);
  });

  it("«Devoluções» não repete «Entregues»: só a janela da política conta", () => {
    const recent = makeOrder("recente", "Entregue", 2);
    const old = makeOrder("antigo", "Entregue", RETURN_WINDOW_DAYS + 5);

    expect(orderMatchesTab(recent, tab("entregues"))).toBe(true);
    expect(orderMatchesTab(old, tab("entregues"))).toBe(true);
    expect(orderMatchesTab(recent, tab("devolucoes"))).toBe(true);
    expect(orderMatchesTab(old, tab("devolucoes"))).toBe(false);
  });

  it("conta os pedidos de cada separador", () => {
    const counts = tabCounts([
      makeOrder("a", "Pedido recebido"),
      makeOrder("b", "Enviado"),
      makeOrder("c", "Entregue", 1),
      makeOrder("d", "Entregue", 40),
      makeOrder("e", "Cancelado"),
    ]);

    expect(counts).toEqual({
      todos: 5,
      "a-processar": 1,
      enviados: 1,
      entregues: 2,
      cancelados: 1,
      devolucoes: 1,
    });
  });
});

describe("regras de cancelamento e devolução", () => {
  it("só deixa cancelar pedidos em curso", () => {
    expect(canCancelOrder("Pedido recebido")).toBe(true);
    expect(canCancelOrder("Em trânsito")).toBe(true);
    expect(canCancelOrder("Entregue")).toBe(false);
    expect(canCancelOrder("Cancelado")).toBe(false);
  });

  it("só aceita devolução de pedidos entregues dentro da janela", () => {
    expect(canRequestReturn(makeOrder("novo", "Entregue", 1))).toBe(true);
    expect(
      canRequestReturn(makeOrder("limite", "Entregue", RETURN_WINDOW_DAYS - 0.5)),
    ).toBe(true);
    expect(canRequestReturn(makeOrder("fora", "Entregue", RETURN_WINDOW_DAYS + 1))).toBe(
      false,
    );
    expect(canRequestReturn(makeOrder("enviado", "Enviado", 1))).toBe(false);
  });

  it("não aceita devolução com data inválida (nada é inventado)", () => {
    const broken = { ...makeOrder("sem-data", "Entregue"), date: "não é uma data" };
    expect(canRequestReturn(broken)).toBe(false);
  });
});
