"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, PackageSearch, RefreshCw, Truck, XCircle } from "lucide-react";
import { cancelOrder, fetchOrderTracking } from "@/lib/orders";
import { ApiError } from "@/lib/api";
import type { Order } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { isProviderPaymentLink } from "@/lib/payments";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useCurrency } from "@/context/CurrencyContext";
import { StatusTimeline } from "@/components/checkout/StatusTimeline";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export function OrderTracking({ id, email }: { id: string; email?: string }) {
  const { format } = useCurrency();
  const { user } = useAuth();
  const { notify } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  // Contagem até abrir sozinho o link que o admin acabou de publicar (null = não).
  const [autoOpenSeconds, setAutoOpenSeconds] = useState<number | null>(null);
  const autoOpenTimer = useRef<number | null>(null);
  const autoOpenTick = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    // O `loading` só arranca como true (primeira carga); nas atualizações manuais
    // o estado anterior mantém-se visível até chegar o novo (sem flicker).
    fetchOrderTracking(id, email).then((o) => {
      if (!alive) return;
      setOrder(o);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [id, email, tick]);

  // Enquanto o pedido espera pagamento, atualiza sozinho: o admin pode colar o
  // link a qualquer momento e o cliente deve vê-lo sem recarregar a página.
  useEffect(() => {
    if (!order || order.status !== "Aguarda pagamento") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 20_000);
    return () => window.clearInterval(id);
  }, [order]);

  // Cancela a contagem/abertura se a página sair antes dos 3 s.
  useEffect(() => {
    return () => {
      if (autoOpenTimer.current) window.clearTimeout(autoOpenTimer.current);
      if (autoOpenTick.current) window.clearInterval(autoOpenTick.current);
    };
  }, []);

  // Aviso (e abertura) quando o link aparece — mas não na primeira carga, em que
  // ele já vinha no pedido. O admin cola o link da PaySuite no painel; o cliente
  // que está a olhar para esta página não tem de voltar a clicar: espera 3 s e
  // a página de pagamento abre sozinha. Só links do provedor abrem sozinhos.
  const linkSeen = useRef<boolean | null>(null);
  useEffect(() => {
    if (!order) return;
    const hasLink = Boolean(order.checkoutUrl);
    if (linkSeen.current === null) {
      linkSeen.current = hasLink;
      return;
    }
    if (hasLink && !linkSeen.current) {
      linkSeen.current = true;
      notify("O seu link de pagamento está pronto — já pode pagar ✅");
      const url = order.checkoutUrl;
      if (isProviderPaymentLink(url)) {
        // queueMicrotask: o projeto evita setState síncrono dentro de efeitos
        // (padrão usado no checkout) — re-render em cascata.
        queueMicrotask(() => setAutoOpenSeconds(3));
        autoOpenTick.current = window.setInterval(
          () => setAutoOpenSeconds((s) => (s == null ? null : Math.max(0, s - 1))),
          1000,
        );
        autoOpenTimer.current = window.setTimeout(() => {
          if (autoOpenTick.current) window.clearInterval(autoOpenTick.current);
          window.location.assign(url!);
        }, 3000);
      }
    }
  }, [order, notify]);

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
        {/* A página não tinha h1 nenhum neste estado. */}
        <h1 className="sr-only">Acompanhar pedido</h1>
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

  // Só o dono (ou admin) consegue cancelar, mas isso é validado no servidor:
  // aqui basta esconder a ação de convidados e em estados terminais.
  const canCancel = Boolean(user) && order.status !== "Entregue" && order.status !== "Cancelado";

  const handleCancel = async () => {
    if (cancelling) return;
    if (!window.confirm(`Cancelar o pedido ${order.id}? O stock será reposto.`)) return;
    setCancelling(true);
    try {
      setOrder(await cancelOrder(order.id));
    } catch (err) {
      window.alert(
        err instanceof ApiError ? err.message : "Não foi possível cancelar o pedido.",
      );
    } finally {
      setCancelling(false);
    }
  };

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

      <div className="mt-6 rounded-2xl border border-slate-100 bg-surface p-5">
        <StatusTimeline current={order.status} />
        {/* Link de pagamento: o que o cliente abre é o do PROVEDOR (PaySuite) ou
            o que o admin colou no pedido — nunca uma página interna da loja, e
            nunca um link que o próprio cliente gere. Sem link, o cliente espera
            o da loja (que é avisado por email/WhatsApp quando o cola). */}
        {order.status === "Aguarda pagamento" && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            {order.checkoutUrl ? (
              <Button href={order.checkoutUrl} size="sm">
                {isProviderPaymentLink(order.checkoutUrl)
                  ? "Pagar agora"
                  : "Abrir página de pagamento"}
              </Button>
            ) : (
              <span className="text-xs font-semibold text-amber-700">
                A aguardar o link de pagamento da loja — vai receber por email (e WhatsApp,
                se tiver o canal ligado) assim que estiver pronto.
              </span>
            )}
            {autoOpenSeconds != null && (
              <span className="text-xs font-semibold text-primary-700">
                A abrir a página de pagamento em {autoOpenSeconds} s…
              </span>
            )}
            {order.checkoutUrl && (
              <span className="text-xs text-slate-500">
                Conclua o pagamento para o pedido avançar. Dúvidas? Fale com o suporte.
              </span>
            )}
          </div>
        )}
        {order.trackingCode && (
          <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
            <Truck className="size-4 text-primary-600" aria-hidden />
            <span className="font-semibold text-slate-800">Código de rastreamento:</span>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-sm font-bold text-slate-800">
              {order.trackingCode}
            </span>
          </p>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-surface p-5">
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
            <div className="flex justify-between text-emerald-700">
              <dt>Desconto</dt>
              <dd className="font-semibold">-{format(order.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-slate-500">Envio</dt>
            <dd className={order.shipping === 0 ? "font-semibold text-emerald-700" : "font-semibold text-slate-800"}>
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

      <div className="mt-6 rounded-2xl border border-slate-100 bg-surface p-5 text-sm">
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
        {canCancel && (
          <Button variant="outline" loading={cancelling} onClick={() => void handleCancel()}>
            <XCircle className="size-4" /> Cancelar pedido
          </Button>
        )}
      </div>
    </div>
  );
}
