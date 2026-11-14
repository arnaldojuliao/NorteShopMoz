"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";
import { useCurrency } from "@/context/CurrencyContext";
import { decideReturn, listAdminReturns, retryRefund, type ReturnRequestItem, type ReturnStatus } from "@/lib/admin";
import { cn } from "@/lib/utils";

/** Tons de estado da devolução (independente do estado do pedido). */
const RETURN_TONE: Record<ReturnStatus, string> = {
  PEDIDO: "bg-amber-50 text-amber-700",
  APROVADA: "bg-sky-50 text-sky-700",
  REJEITADA: "bg-red-50 text-red-600",
  REEMBOLSADA: "bg-emerald-50 text-emerald-700",
};

/**
 * Gestão de devoluções (painel admin): aprovar (tenta o estorno logo) ou
 * rejeitar. Aprovar num pagamento online fecha o caso como REEMBOLSADA se o
 * gateway aceitar; se o estorno falhar, fica APROVADA e aparece na fila de
 * incidências.
 */
export function AdminReturnsPanel() {
  const { format } = useCurrency();
  const [returns, setReturns] = useState<ReturnRequestItem[]>([]);
  const [filter, setFilter] = useState<ReturnStatus | "">("PEDIDO");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async (f: ReturnStatus | "") => {
    setLoading(true);
    setError(null);
    try {
      setReturns(await listAdminReturns(f || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar devoluções");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // queueMicrotask: o setState do loading não pode disparar dentro do efeito
    // (regra react-hooks/set-state-in-effect).
    queueMicrotask(() => void load(filter));
  }, [filter]);

  const decide = async (ret: ReturnRequestItem, decision: "APROVADA" | "REJEITADA") => {
    const note = window.prompt(
      decision === "APROVADA"
        ? `Aprovar devolução do pedido ${ret.orderId}? Nota (opcional):`
        : `Rejeitar devolução do pedido ${ret.orderId}? Nota (opcional):`,
    );
    if (note === null) return;
    setBusyId(ret.id);
    setError(null);
    try {
      const updated = await decideReturn(ret.id, decision, note);
      setReturns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação falhou");
    } finally {
      setBusyId(null);
    }
  };

  /** Retry do estorno — devolução APROVADA cujo primeiro estorno falhou. */
  const retry = async (ret: ReturnRequestItem) => {
    setBusyId(ret.id);
    setError(null);
    try {
      const updated = await retryRefund(ret.id);
      setReturns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      if (updated.status === "REEMBOLSADA") {
        window.alert("Estorno aceite pelo gateway — devolução fechada como REEMBOLSADA.");
      } else {
        window.alert("O estorno falhou de novo — a devolução continua APROVADA (veja as incidências).");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação falhou");
    } finally {
      setBusyId(null);
    }
  };

  const filters: (ReturnStatus | "")[] = ["PEDIDO", "APROVADA", "REEMBOLSADA", "REJEITADA", ""];

  return (
    <div className="mt-6 space-y-4">
      <div className="no-scrollbar flex flex-wrap items-center gap-1.5 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f || "todas"}
            onClick={() => setFilter(f)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition",
              filter === f
                ? "border-navy-900 bg-navy-900 text-white"
                : "border-slate-200 bg-surface text-slate-600 hover:border-slate-300",
            )}
          >
            {f || "Todas"}
          </button>
        ))}
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => void load(filter)} disabled={loading}>
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Atualizar
        </Button>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          {error}
        </div>
      )}

      {loading && returns.length === 0 && (
        <div className="flex justify-center py-10">
          <Loader2 className="size-7 animate-spin text-primary-600" />
        </div>
      )}

      {!loading && returns.length === 0 && !error && (
        <EmptyState
          icon={Undo2}
          title="Nenhuma devolução"
          description="Os pedidos de devolução dos clientes aparecem aqui."
        />
      )}

      <div className="space-y-3">
        {returns.map((r) => (
          <div key={r.id} className="rounded-2xl border border-slate-100 bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display font-bold text-slate-900">{r.orderId}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", RETURN_TONE[r.status])}>
                    {r.status}
                  </span>
                  {r.order?.status ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
                      pedido: {r.order.status}
                    </span>
                  ) : null}
                  {r.refundAmount != null && r.status === "REEMBOLSADA" && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      reembolsado {format(r.refundAmount)}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-slate-600">{r.reason}</p>
                {r.adminNote && <p className="mt-0.5 text-xs text-slate-400">Nota: {r.adminNote}</p>}
                <p className="mt-0.5 text-xs text-slate-400">
                  pedido em {formatDate(r.createdAt)}
                  {r.updatedAt !== r.createdAt ? ` · atualizado ${formatDate(r.updatedAt)}` : ""}
                  {r.order?.paymentMethod ? ` · ${r.order.paymentMethod}` : ""}
                </p>
              </div>
              {r.status === "PEDIDO" && (
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => void decide(r, "APROVADA")} loading={busyId === r.id}>
                    <CheckCircle2 className="size-3.5" /> Aprovar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-600"
                    onClick={() => void decide(r, "REJEITADA")}
                    loading={busyId === r.id}
                  >
                    <XCircle className="size-3.5" /> Rejeitar
                  </Button>
                </div>
              )}
              {r.status === "APROVADA" && (
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-xs font-semibold text-amber-700">
                    Estorno pendente — tente novamente
                  </span>
                  <Button size="sm" onClick={() => void retry(r)} loading={busyId === r.id}>
                    <Undo2 className="size-3.5" /> Estornar de novo
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
