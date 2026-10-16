"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { useLocalStorageState } from "@/lib/hooks";
import {
  cancelOrder,
  fetchMyOrdersStrict,
  fetchOrderStatus,
  getOrdersKey,
  ORDERS_KEY,
} from "@/lib/orders";
import type { Order } from "@/lib/types";

export type OrdersPhase = "loading" | "ready" | "error";

/**
 * Pedidos da conta — a mesma lógica da página de configurações, extraída para
 * poder ser reutilizada por qualquer ecrã de conta sem a duplicar:
 *
 *  1. pedidos locais (checkout de convidado) + pedidos do servidor, unidos por id;
 *  2. o estado REAL de cada pedido no backend (lookup público por id), para o
 *     cartão não mostrar um estado desatualizado do que ficou guardado;
 *  3. cancelamento (o servidor valida a propriedade, repõe o stock e envia email).
 *
 * Distingue «não tenho pedidos» de «não consegui carregar»: `phase === "error"`
 * só acontece quando a listagem do servidor falha por algo que não seja 401
 * (sessão terminada → tratado como ausência, o local ainda é mostrado).
 */
export function useAccountOrders() {
  const { user, initializing, sessionExpired } = useAuth();
  const { notify } = useToast();

  const ordersKey = user ? getOrdersKey(user.id) : ORDERS_KEY;
  const [localOrders] = useLocalStorageState<Order[]>(ordersKey, []);
  const [orders, setOrders] = useState<Order[]>([]);
  const [live, setLive] = useState<Record<string, Order>>({});
  const [phase, setPhase] = useState<OrdersPhase>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Lista de pedidos (servidor + locais).
  useEffect(() => {
    // A sessão ainda está a ser verificada: não é «sem pedidos», é «à espera».
    if (initializing) return;

    let alive = true;

    const load = async () => {
      // Sem sessão não existem pedidos no servidor: um GET /api/orders anónimo
      // responde sempre 401 (pedido desperdiçado + ruído na consola).
      if (!user?.id) {
        setOrders(localOrders);
        setPhase("ready");
        return;
      }

      try {
        const server = await fetchMyOrdersStrict();
        if (!alive) return;
        const byId = new Map(server.map((o) => [o.id, o]));
        for (const o of localOrders) if (!byId.has(o.id)) byId.set(o.id, o);
        setOrders([...byId.values()]);
        setPhase("ready");
      } catch (err) {
        if (!alive) return;
        const status = err instanceof ApiError ? err.status : 0;
        if (status === 401) {
          // Sessão terminada: cai para os pedidos locais, não é uma avaria.
          setOrders(localOrders);
          setPhase("ready");
        } else {
          // Mantém o que já havia em ecrã (melhor do que esvaziar a lista).
          setOrders((prev) => (prev.length > 0 ? prev : localOrders));
          setPhase("error");
        }
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [localOrders, user?.id, initializing, sessionExpired, reloadKey]);

  // Estado real de cada pedido (lookup público por id).
  useEffect(() => {
    // Sem pedidos não há nada para consultar (e não se limpa `live` com um
    // `setState` síncrono dentro do efeito: entradas órfãs nunca são lidas).
    if (orders.length === 0) return;
    let alive = true;
    Promise.all(orders.map((o) => fetchOrderStatus(o.id))).then((results) => {
      if (!alive) return;
      const merged: Record<string, Order> = {};
      for (const order of results) {
        if (order) merged[order.id] = order;
      }
      setLive(merged);
    });
    return () => {
      alive = false;
    };
  }, [orders]);

  /** Estado a mostrar: o real (backend) quando disponível, senão o guardado. */
  const statusOf = useCallback((o: Order) => live[o.id]?.status ?? o.status, [live]);

  /** Valor a mostrar (o servidor recalcula os totais) — o local é o fallback. */
  const orderOf = useCallback((o: Order) => live[o.id] ?? o, [live]);

  /** Recarrega a lista — o estado «a carregar» é marcado aqui (evento), não no efeito. */
  const reload = useCallback(() => {
    setPhase("loading");
    setReloadKey((k) => k + 1);
  }, []);

  /** Cancela um pedido — o servidor valida a propriedade e repõe o stock. */
  const cancel = useCallback(
    async (o: Order) => {
      if (cancellingId) return;
      if (!window.confirm(`Cancelar o pedido ${o.id}? O stock será reposto.`)) return;
      setCancellingId(o.id);
      try {
        const updated = await cancelOrder(o.id);
        setLive((prev) => ({ ...prev, [updated.id]: updated }));
        setOrders((prev) =>
          prev.map((x) => (x.id === updated.id ? { ...x, status: updated.status } : x)),
        );
        notify("Pedido cancelado.");
      } catch (err) {
        notify(
          err instanceof ApiError ? err.message : "Não foi possível cancelar o pedido.",
          "error",
        );
      } finally {
        setCancellingId(null);
      }
    },
    [cancellingId, notify],
  );

  return {
    orders,
    phase,
    reloadKey,
    reload,
    statusOf,
    orderOf,
    cancel,
    cancellingId,
    isAuthenticated: Boolean(user),
  };
}