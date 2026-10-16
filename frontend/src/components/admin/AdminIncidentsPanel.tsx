"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";
import { listPaymentIncidents, resolvePaymentIncident, type PaymentIncident } from "@/lib/admin";
import { cn } from "@/lib/utils";

/**
 * Fila de reconciliação de pagamentos: falhas de webhook (payment.failed) e
 * estornos que falharam. Cada linha é um caso aberto — "resolver" fecha-o
 * (típic. depois de tratar no painel do provedor).
 */
export function AdminIncidentsPanel() {
  const [incidents, setIncidents] = useState<PaymentIncident[]>([]);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async (openOnly: boolean) => {
    setLoading(true);
    setError(null);
    try {
      setIncidents(await listPaymentIncidents(openOnly ? "ABERTA" : undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar incidências");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // queueMicrotask: o setState do loading não pode disparar dentro do efeito
    // (regra react-hooks/set-state-in-effect).
    queueMicrotask(() => void load(onlyOpen));
  }, [onlyOpen]);

  const resolve = async (incident: PaymentIncident) => {
    const note = window.prompt(
      `Nota da resolução (opcional) — incidência #${incident.id} do pedido ${incident.orderId}:`,
    );
    if (note === null) return;
    setBusyId(incident.id);
    setError(null);
    try {
      const updated = await resolvePaymentIncident(incident.id, note);
      setIncidents((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação falhou");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          <button
            onClick={() => setOnlyOpen(true)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-bold transition",
              onlyOpen ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-surface text-slate-600",
            )}
          >
            Abertas
          </button>
          <button
            onClick={() => setOnlyOpen(false)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-bold transition",
              !onlyOpen ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-surface text-slate-600",
            )}
          >
            Todas
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load(onlyOpen)} disabled={loading}>
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Atualizar
        </Button>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          {error}
        </div>
      )}

      {loading && incidents.length === 0 && (
        <div className="flex justify-center py-10">
          <Loader2 className="size-7 animate-spin text-primary-600" />
        </div>
      )}

      {!loading && incidents.length === 0 && !error && (
        <EmptyState
          icon={CheckCircle2}
          title="Nenhuma incidência"
          description={
            onlyOpen
              ? "Sem casos abertos — falhas de webhook e estornos aparecem aqui quando acontecem."
              : "Ainda não houve incidências de pagamento."
          }
        />
      )}

      <div className="space-y-3">
        {incidents.map((i) => {
          const open = i.status === "ABERTA";
          return (
            <div
              key={i.id}
              className={cn(
                "rounded-2xl border bg-surface p-4",
                open ? "border-amber-200" : "border-slate-100",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "flex size-8 items-center justify-center rounded-lg",
                        open ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700",
                      )}
                    >
                      {open ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
                    </span>
                    <p className="font-display font-bold text-slate-900">{i.orderId}</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        i.incidentType === "WEBHOOK_FAILED"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-red-50 text-red-600",
                      )}
                    >
                      {i.incidentType === "WEBHOOK_FAILED" ? "Pagamento não concluído" : "Estorno falhou"}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", open ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700")}>
                      {i.status}
                    </span>
                  </div>
                  {i.detail && <p className="mt-1.5 text-sm text-slate-600">{i.detail}</p>}
                  <p className="mt-0.5 text-xs text-slate-400">
                    {formatDate(i.createdAt)}
                    {i.paymentReference ? ` · ref. ${i.paymentReference}` : ""}
                    {i.resolvedAt ? ` · resolvida ${formatDate(i.resolvedAt)}` : ""}
                  </p>
                </div>
                {open && (
                  <Button
                    size="sm"
                    onClick={() => void resolve(i)}
                    loading={busyId === i.id}
                  >
                    <CheckCircle2 className="size-3.5" /> Resolver
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
