"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, PackageSearch, RefreshCw } from "lucide-react";
import { fetchOrderTracking } from "@/lib/orders";
import type { Order } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { useCurrency } from "@/context/CurrencyContext";
import { StatusTimeline } from "@/components/checkout/StatusTimeline";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export function OrderTracking({ id }: { id: string }) {
  const { format } = useCurrency();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    // O `loading` só arranca como true (primeira carga); nas atualizações manuais
    // o estado anterior mantém-se visível até chegar o novo (sem flicker).
    fetchOrderTracking(id).then((o) => {
      if (!alive) return;
      setOrder(o);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [id, tick]);

  if (loading) {
    return (
      <div className="container-nsm max-w-3xl py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-56 rounded-xl bg-slate-100" />
          <div className="h-24 rounded-2xl bg-slate-100" />
          <div className="h-40 rounded-2xl bg-slate-100" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container-nsm py-16">
        <EmptyState
          icon={PackageSearch}
          title="Pedido não encontrado"
          description="Verifique o link ou o número do pedido. Se comprou como convidado, use o link enviado por email."
          actionLabel="Ir para a loja"
          actionHref="/"
        />
      </div>
    );
  }

  return (
    <div className="container-nsm max-w-3xl py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">{order.id}</h1>
          <p className="text-sm text-slate-500">
            {formatDate(order.date)} · {order.paymentMethod}
          </p>
        </div>
        <button
          onClick={() => setTick((t) => t + 1)}
          className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-primary-400 hover:text-primary-700"
        >
          <RefreshCw className="size-4" /> Atualizar estado
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-5">
        <StatusTimeline current={order.status} />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-5">
        <ul className="space-y-3">
          {order.items.map((i) => (
            <li key={i.productId + (i.variant ?? "")} className="flex items-center justify-between gap-3">
              <p className="line-clamp-1 text-sm text-slate-700">
                <Link href={`/produto/${i.slug}`} className="hover:text-primary-700">
                  {i.qty}× {i.name}
                </Link>
                {i.variant && <span className="text-slate-400"> · {i.variant}</span>}
              </p>
              <span className="shrink-0 text-sm font-semibold text-slate-800 tabular-nums">
                {format(i.price * i.qty)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Subtotal</dt>
            <dd className="font-semibold text-slate-800 tabular-nums">{format(order.subtotal)}</dd>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <dt>Desconto</dt>
              <dd className="font-semibold">-{format(order.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-slate-500">Envio</dt>
            <dd className={order.shipping === 0 ? "font-semibold text-emerald-600" : "font-semibold text-slate-800"}>
              {order.shipping === 0 ? "Grátis" : format(order.shipping)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-slate-100 pt-2">
            <dt className="font-bold text-slate-900">TOTAL</dt>
            <dd className="font-display text-lg font-extrabold text-slate-900 tabular-nums">
              {format(order.total)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 text-sm">
        <p className="flex items-center gap-2 font-bold text-slate-900">
          <MapPin className="size-4 text-primary-600" /> Entrega para
        </p>
        <p className="mt-2 text-slate-700">
          {order.address.fullName} · {order.address.phone}
        </p>
        <p className="text-slate-600">
          {order.address.address}, {order.address.city} — {order.address.province}
        </p>
        {order.address.notes && <p className="mt-1 text-xs text-slate-400">{order.address.notes}</p>}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button href="/" variant="outline">
          Continuar a comprar
        </Button>
        <Button href="/configuracoes" variant="secondary">
          Ir para as definições
        </Button>
      </div>
    </div>
  );
}
