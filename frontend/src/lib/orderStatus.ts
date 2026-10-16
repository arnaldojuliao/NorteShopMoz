import type { Order, OrderStatus } from "@/lib/types";

/**
 * Estados de pedido — fonte única para os tons dos badges, o agrupamento dos
 * separadores ("tabs") e a regra de cancelamento.
 *
 * Vive aqui (e não dentro da página) porque a lista de pedidos da conta, os
 * filtros e o painel de administração têm de concordar: um estado novo no
 * backend passa a ter badge e tab sem se tocar em dois sítios. Os tons usam a
 * paleta do tema (incluindo os acentos `accent`/`teal`), que o tema escuro
 * remapeia — veja-se `html.dark` em `globals.css`.
 */

/** Cor discreta de cada estado (pílula/badge). */
export const STATUS_TONE: Record<OrderStatus, string> = {
  "Aguarda pagamento": "bg-amber-50 text-amber-700",
  "Pedido recebido": "bg-sky-50 text-sky-700",
  "Pagamento confirmado": "bg-primary-50 text-primary-700",
  "Em preparação": "bg-amber-50 text-amber-700",
  Enviado: "bg-accent/15 text-accent-strong",
  "Em trânsito": "bg-teal/15 text-teal-strong",
  Entregue: "bg-emerald-50 text-emerald-700",
  Cancelado: "bg-red-50 text-red-700",
};

/** Tons do estado no cartão (limite/fundo) — `neutral` quando não há estado. */
export type CardTone = "neutral" | "info" | "warning" | "success" | "danger";

export const STATUS_CARD_TONE: Record<OrderStatus, CardTone> = {
  "Aguarda pagamento": "warning",
  "Pedido recebido": "info",
  "Pagamento confirmado": "info",
  "Em preparação": "warning",
  Enviado: "info",
  "Em trânsito": "info",
  Entregue: "success",
  Cancelado: "danger",
};

/**
 * Grupos dos separadores. Cada grupo é uma função sobre o conjunto de estados
 * REAIS do backend (`OrderStatus`), para o filtro nunca divergir do que o
 * servidor devolve.
 */
export type OrderTabId = "todos" | "a-processar" | "enviados" | "entregues" | "cancelados" | "devolucoes";

export interface OrderTab {
  id: OrderTabId;
  label: string;
  /** Os estados que este separador mostra (vazio = todos). */
  statuses: OrderStatus[];
  /**
   * Filtro próprio do separador, quando este não corresponde a estados do
   * backend (ex.: «Devoluções» depende da janela de devolução, não do estado).
   * Quando existe, tem precedência sobre `statuses`.
   */
  match?: (order: Order) => boolean;
}

export const ORDER_TABS: OrderTab[] = [
  { id: "todos", label: "Todos", statuses: [] },
  {
    id: "a-processar",
    label: "A processar",
    // "Aguarda pagamento" é o estado inicial dos pedidos com checkout hospedado
    // (PaySuite): enquanto o cliente não paga, é um pedido a processar.
    statuses: ["Aguarda pagamento", "Pedido recebido", "Pagamento confirmado", "Em preparação"],
  },
  { id: "enviados", label: "Enviados", statuses: ["Enviado", "Em trânsito"] },
  { id: "entregues", label: "Entregues", statuses: ["Entregue"] },
  { id: "cancelados", label: "Cancelados", statuses: ["Cancelado"] },
  // Sem estado próprio no backend: "Devoluções" mostra apenas os pedidos que a
  // loja ainda aceita devolver (entregues dentro da janela da política) — sem
  // isto o separador repetia exatamente a lista de "Entregues".
  {
    id: "devolucoes",
    label: "Devoluções",
    statuses: ["Entregue"],
    match: (order) => canRequestReturn(order),
  },
];

/** Um pedido pertence ao separador? (`todos` mostra tudo.) */
export function orderMatchesTab(order: Order, tab: OrderTab): boolean {
  if (tab.match) return tab.match(order);
  return tab.statuses.length === 0 || tab.statuses.includes(order.status);
}

/** Nº de pedidos em cada separador — os contadores das tabs. */
export function tabCounts(orders: Order[]): Record<OrderTabId, number> {
  const counts = {} as Record<OrderTabId, number>;
  for (const tab of ORDER_TABS) {
    counts[tab.id] = orders.filter((o) => orderMatchesTab(o, tab)).length;
  }
  return counts;
}

/**
 * O pedido pode ser cancelado? Espelha a regra do backend
 * (`OrderService.cancelOrder` recusa um pedido já entregue ou já cancelado) —
 * o botão de cancelar só aparece quando o servidor o aceitaria.
 */
export function canCancelOrder(status: OrderStatus): boolean {
  return status !== "Entregue" && status !== "Cancelado";
}

/**
 * O pedido pode ser devolvido? A loja aceita devoluções até 7 dias após a
 * receção (política em `/devolucoes`) e sem fluxo de devolução no sistema: o
 * botão abre o suporte, não promete um reembolso automático.
 */
export const RETURN_WINDOW_DAYS = 7;

export function canRequestReturn(order: Order): boolean {
  if (order.status !== "Entregue") return false;
  const delivered = new Date(order.date).getTime();
  if (Number.isNaN(delivered)) return false;
  const days = (Date.now() - delivered) / 86_400_000;
  return days >= 0 && days <= RETURN_WINDOW_DAYS;
}

/** Rótulo do estado real do pedido (o backend já o serve em português). */
export function statusLabel(status: OrderStatus): string {
  return status;
}