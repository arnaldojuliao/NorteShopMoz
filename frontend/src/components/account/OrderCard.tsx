"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  MapPin,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Truck,
  XCircle,
} from "lucide-react";
import { ProductImage } from "@/components/product/ProductImage";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { useCurrency } from "@/context/CurrencyContext";
import { formatDate } from "@/lib/format";
import { canCancelOrder, canRequestReturn, STATUS_TONE } from "@/lib/orderStatus";
import { requestReturn, type ReturnRequestItem, type ReturnStatus } from "@/lib/admin";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";
import { whatsappHref } from "@/config/site";

/** Tons do estado da devolução (o card mostra o estado real do pedido). */
const RETURN_TONE: Record<ReturnStatus, string> = {
  PEDIDO: "bg-amber-50 text-amber-700",
  APROVADA: "bg-sky-50 text-sky-700",
  REJEITADA: "bg-red-50 text-red-600",
  REEMBOLSADA: "bg-emerald-50 text-emerald-700",
};

/**
 * Cartão de uma encomenda na lista de pedidos.
 *
 * Mostra apenas dados REAIS do pedido (número, data, estado, artigos, total,
 * pagamento e morada) — nada é inventado quando um campo não vem. As ações
 * aparecem só quando o sistema as aceita: cancelar espelha a regra do backend,
 * e a devolução abre o fluxo real (POST /api/returns/{orderId}) quando o pedido
 * está entregue na janela da política — com fallback para o WhatsApp quando o
 * pedido não é de conta (convidado) ou a API recusa.
 */
export function OrderCard({
  order,
  cancelling,
  onCancel,
  onReorder,
  returnStatus,
  onReturnUpdated,
}: {
  order: Order;
  cancelling: boolean;
  onCancel: () => void;
  onReorder: () => void;
  /** Estado da devolução já registada para este pedido (null = nenhuma). */
  returnStatus?: ReturnStatus | null;
  /** Chamado quando o pedido de devolução é aceite pelo servidor. */
  onReturnUpdated?: (item: ReturnRequestItem) => void;
}) {
  const { format } = useCurrency();
  const totalItems = order.items.reduce((n, i) => n + i.qty, 0);
  const cancellable = canCancelOrder(order.status);
  const returnable = canRequestReturn(order);
  const hasReturn = Boolean(returnStatus);

  // Fluxo de devolução (inline no cartão): motivo → POST /api/returns/{orderId}.
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  const submitReturn = async () => {
    if (!reason.trim()) {
      setReturnError("Indique o motivo da devolução");
      return;
    }
    setSubmittingReturn(true);
    setReturnError(null);
    try {
      const item = await requestReturn(order.id, reason.trim());
      onReturnUpdated?.(item);
      setReturnOpen(false);
      setReason("");
    } catch (err) {
      setReturnError(err instanceof Error ? err.message : "Não foi possível pedir a devolução");
    } finally {
      setSubmittingReturn(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-100 bg-surface shadow-card transition-shadow hover:shadow-card-hover">
      {/* Cabeçalho: número, data e estado */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-sm font-extrabold text-slate-900">{order.id}</span>
            <span className="text-xs text-slate-400">{formatDate(order.date)}</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {totalItems} {totalItems === 1 ? "artigo" : "artigos"}
            {order.trackingCode ? ` · tracking ${order.trackingCode}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {returnStatus && (
            <span className={cn("rounded-full px-3 py-1 text-xs font-bold", RETURN_TONE[returnStatus])}>
              devolução: {returnStatus.toLowerCase()}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
              STATUS_TONE[order.status] ?? "bg-slate-100 text-slate-600",
            )}
          >
            {order.status}
          </span>
        </div>
      </header>

      {/* Artigos */}
      <ul className="divide-y divide-slate-100">
        {order.items.map((item) => (
          <li key={item.productId + (item.variant ?? "")} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <Link
              href={`/produto/${item.slug}`}
              className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-slate-50 to-slate-100"
            >
              <ProductImage src={item.image} alt={item.name} fill sizes="56px" />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/produto/${item.slug}`}
                className="line-clamp-2 text-sm font-medium text-slate-700 transition hover:text-primary-700"
              >
                {item.name}
              </Link>
              <p className="mt-0.5 text-xs text-slate-400">
                {item.qty}× {format(item.price)}
                {item.variant ? ` · ${item.variant}` : ""}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
              {format(item.price * item.qty)}
            </span>
          </li>
        ))}
      </ul>

      {/* Resumo: pagamento, entrega e total */}
      <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Truck className="size-3.5 shrink-0 text-primary-600" aria-hidden />
            <dt className="sr-only">Pagamento</dt>
            <dd>
              {order.paymentMethod}
              {order.paymentReference ? ` · ${order.paymentReference}` : ""}
            </dd>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500 sm:justify-end">
            <MapPin className="size-3.5 shrink-0 text-primary-600" aria-hidden />
            <dt className="sr-only">Entrega</dt>
            <dd className="truncate">
              {order.address.city}, {order.address.province}
            </dd>
          </div>
        </dl>

        <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-slate-200/70 pt-2.5">
          <span className="text-sm text-slate-500">Total</span>
          <span className="font-display text-base font-extrabold tabular-nums text-slate-900">
            {format(order.total)}
          </span>
        </div>
      </div>

      {/* Formulário de devolução (inline) */}
      {returnOpen && (
        <div className="border-t border-primary-100 bg-primary-50/40 px-4 py-4 sm:px-5">
          <p className="text-sm font-bold text-slate-900">Pedir devolução do pedido {order.id}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Diz-nos o que aconteceu — a loja responde com a aprovação ou a recusa, e o reembolso
            (quando aplicável) volta pelo mesmo método de pagamento.
          </p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: o produto chegou danificado / não é o que encomendei…"
            rows={3}
            maxLength={2000}
            className="mt-2"
          />
          {returnError && <p className="mt-1.5 text-xs font-semibold text-red-600">{returnError}</p>}
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => void submitReturn()} loading={submittingReturn} disabled={!reason.trim()}>
              Enviar pedido
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setReturnOpen(false);
                setReturnError(null);
              }}
              disabled={submittingReturn}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Confirmação de devolução pedida */}
      {hasReturn && !returnOpen && (
        <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <CheckCircle2 className="size-3.5 text-primary-600" aria-hidden />
            Devolução registada — acompanha o estado aqui e no teu email.
          </p>
        </div>
      )}

      {/* Ações */}
      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
        <Button href={`/pedido/${encodeURIComponent(order.id)}`} size="sm" variant="outline">
          Ver detalhes
          <ArrowRight className="size-3.5" aria-hidden />
        </Button>
        <Button href={`/pedido/${encodeURIComponent(order.id)}`} size="sm" variant="ghost">
          <Truck className="size-3.5" aria-hidden />
          Acompanhar entrega
        </Button>
        <Button size="sm" variant="ghost" onClick={onReorder}>
          <RefreshCw className="size-3.5" aria-hidden />
          Comprar novamente
        </Button>

        {cancellable && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            loading={cancelling}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            {!cancelling && <XCircle className="size-3.5" aria-hidden />}
            {cancelling ? "A cancelar..." : "Solicitar cancelamento"}
          </Button>
        )}

        {returnable && !returnStatus && !returnOpen && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setReturnOpen(true)}
            className="text-primary-700 hover:bg-primary-50"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Solicitar devolução
          </Button>
        )}

        <Button
          href={whatsappHref(`Olá! Preciso de ajuda com o pedido ${order.id}.`)}
          target="_blank"
          size="sm"
          variant="ghost"
          className="ml-auto"
        >
          <MessageSquare className="size-3.5" aria-hidden />
          Ajuda
        </Button>
      </footer>
    </article>
  );
}

/** Esqueleto do cartão, durante o carregamento. */
export function OrderCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-surface">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="space-y-1.5">
          <div className="h-3.5 w-28 animate-pulse rounded bg-slate-200/80" />
          <div className="h-3 w-16 animate-pulse rounded bg-slate-200/80" />
        </div>
        <div className="h-6 w-24 animate-pulse rounded-full bg-slate-200/80" />
      </div>
      <div className="space-y-3 px-5 py-4">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="size-14 animate-pulse rounded-xl bg-slate-200/80" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-4/5 animate-pulse rounded bg-slate-200/80" />
              <div className="h-3 w-24 animate-pulse rounded bg-slate-200/80" />
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 px-5 py-3">
        <div className="h-4 w-32 animate-pulse rounded bg-slate-200/80" />
      </div>
    </div>
  );
}