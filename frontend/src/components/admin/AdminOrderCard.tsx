"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Package, Printer, XCircle } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useCurrency } from "@/context/CurrencyContext";
import { formatDate } from "@/lib/format";
import { ORDER_STATUSES, STATUS_TONE } from "@/lib/orderStatus";
import type { Order, OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Pílula com o estado do pedido (cor vem de `STATUS_TONE`, fonte única). */
function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
        STATUS_TONE[status],
      )}
    >
      {status}
    </span>
  );
}

interface AdminOrderCardProps {
  order: Order;
  /** Pedido a avançar/cancelar está em curso (spinner no botão). */
  advancing: boolean;
  cancelling: boolean;
  onAdvance: (order: Order) => void;
  onCancel: (order: Order) => void;
  onPrintReceipt: (order: Order) => void;
  /** Grava o tracking; código vazio limpa (o cartão envia "-"). */
  onSaveTracking: (order: Order, code: string) => Promise<void>;
  onSavePaymentLink: (order: Order, url: string) => Promise<void>;
}

/**
 * Cartão de um pedido no painel de administração.
 *
 * <p>Foi extraído de `app/admin/page.tsx` (2442 linhas) por ser o bloco com
 * mais estado próprio: os rascunhos do tracking e do link de pagamento vivem
 * aqui — antes eram quatro mapas no topo da página indexados por id do pedido,
 * que ninguém mais usava e que só faziam a página re-renderizar por inteiro a
 * cada tecla escrita.</p>
 *
 * <p>Quem fala com a API é a página (`onSaveTracking`/`onSavePaymentLink`); o
 * cartão trata do rascunho, do estado de gravação e do aviso de erro.</p>
 */
export function AdminOrderCard({
  order: o,
  advancing,
  cancelling,
  onAdvance,
  onCancel,
  onPrintReceipt,
  onSaveTracking,
  onSavePaymentLink,
}: AdminOrderCardProps) {
  const { format } = useCurrency();

  const index = ORDER_STATUSES.indexOf(o.status);
  const canAdvance = index >= 0 && index < ORDER_STATUSES.length - 1;

  // `null` = o utilizador ainda não tocou no campo (mostra o valor do pedido).
  const [trackingDraft, setTrackingDraft] = useState<string | null>(null);
  const [savingTracking, setSavingTracking] = useState(false);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [savingLink, setSavingLink] = useState(false);

  const trackingValue = trackingDraft ?? o.trackingCode ?? "";
  const trackingChanged = trackingValue !== (o.trackingCode ?? "");
  // Campo vazio num pedido que já tem tracking = limpar. O backend usa "-"
  // para isso: antes, apagar o número e gravar não fazia nada (o clique era
  // engolido) e o tracking errado ficava no pedido do cliente.
  const clearingTracking = trackingValue.trim() === "" && Boolean(o.trackingCode);

  const saveTracking = async () => {
    const code = trackingValue.trim();
    if (!code && !clearingTracking) return;
    setSavingTracking(true);
    try {
      await onSaveTracking(o, clearingTracking ? "-" : code);
      setTrackingDraft(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao gravar o tracking";
      window.alert(`Não foi possível gravar o tracking do pedido ${o.id}:\n${msg}`);
    } finally {
      setSavingTracking(false);
    }
  };

  const saveLink = async () => {
    const url = (linkDraft ?? o.checkoutUrl ?? "").trim();
    if (!url) return;
    setSavingLink(true);
    try {
      await onSavePaymentLink(o, url);
      setLinkDraft(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao gravar o link";
      window.alert(`Não foi possível gravar o link do pedido ${o.id}:\n${msg}`);
    } finally {
      setSavingLink(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display font-bold text-slate-900">{o.id}</p>
            <StatusPill status={o.status} />
            {o.items.length > 1 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
                {o.items.length} itens
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {o.address.fullName} · {o.address.phone}
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">
            {o.address.address}, {o.address.city} — {o.address.province} · {o.paymentMethod}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-display text-lg font-bold text-slate-900">{format(o.total)}</span>
          <span className="text-xs text-slate-400">{formatDate(o.date)}</span>
        </div>
      </div>

      <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
        {o.items.slice(0, 3).map((i) => (
          <li key={i.productId + (i.variant ?? "")} className="flex justify-between gap-3">
            <Link
              href={`/produto/${i.slug}`}
              className="line-clamp-1 text-slate-600 hover:text-primary-700"
            >
              {i.qty}× {i.name}
              {i.variant ? ` · ${i.variant}` : ""}
            </Link>
            <span className="shrink-0 font-semibold text-slate-700">
              {format(i.price * i.qty)}
            </span>
          </li>
        ))}
        {o.items.length > 3 && (
          <li className="text-xs font-medium text-slate-400">
            + {o.items.length - 3} outro{o.items.length - 3 === 1 ? "" : "s"} artigo
            {o.items.length - 3 === 1 ? "" : "s"}
          </li>
        )}
      </ul>

      {/* Código de tracking do envio — definido tipicamente ao marcar "Enviado".
          Grava sem mudar o estado (PATCH com o estado atual). */}
      {o.status !== "Cancelado" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-sm">
          <label className="text-xs font-semibold text-slate-500" htmlFor={`tracking-${o.id}`}>
            Tracking:
          </label>
          <input
            id={`tracking-${o.id}`}
            value={trackingValue}
            onChange={(e) => setTrackingDraft(e.target.value)}
            placeholder={o.trackingCode || "nº da transportadora"}
            maxLength={80}
            className="w-48 rounded-lg border border-slate-200 bg-surface px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:border-primary-400 focus:outline-none"
          />
          {trackingChanged && (
            <Button
              variant="outline"
              size="sm"
              loading={savingTracking}
              onClick={() => void saveTracking()}
            >
              {clearingTracking ? "Limpar tracking" : "Gravar tracking"}
            </Button>
          )}
        </div>
      )}

      {/* Link de pagamento — quando o gateway não devolveu um, o admin cola-o
          aqui; o cliente é avisado por email/WhatsApp ao gravar. */}
      {o.status === "Aguarda pagamento" && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-amber-900">
              {o.checkoutUrl
                ? "Link de pagamento"
                : "Link de pagamento em falta — o cliente foi avisado"}
            </p>
            {o.checkoutUrl && (
              <a
                href={o.checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-primary-700 underline underline-offset-2"
              >
                Abrir link
              </a>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              aria-label={`Link de pagamento do pedido ${o.id}`}
              value={linkDraft ?? o.checkoutUrl ?? ""}
              onChange={(e) => setLinkDraft(e.target.value)}
              placeholder="https://paysuite.tech/checkout/..."
              maxLength={500}
              className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-surface px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:border-primary-400 focus:outline-none"
            />
            <Button size="sm" loading={savingLink} onClick={() => void saveLink()}>
              Guardar link
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-amber-800">
            Ao guardar, o cliente recebe o link por email (e WhatsApp, se tiver o canal ligado).
          </p>
        </div>
      )}

      {canAdvance ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-400">
            Próximo estado: <strong className="text-slate-600">{ORDER_STATUSES[index + 1]}</strong>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onPrintReceipt(o)}>
              <Printer className="size-3.5" /> Imprimir recibo
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={cancelling}
              onClick={() => onCancel(o)}
            >
              <XCircle className="size-3.5" /> Cancelar
            </Button>
            <Button size="sm" loading={advancing} onClick={() => onAdvance(o)}>
              Avançar estado <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
          {o.status === "Cancelado" ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
              <XCircle className="size-3.5" /> Pedido cancelado
            </span>
          ) : (
            <>
              <span className="mr-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <Package className="size-3.5" /> Pedido concluído
              </span>
              {/* Também num pedido entregue o recibo pode ser reimpresso. */}
              <Button variant="outline" size="sm" onClick={() => onPrintReceipt(o)}>
                <Printer className="size-3.5" /> Imprimir recibo
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
