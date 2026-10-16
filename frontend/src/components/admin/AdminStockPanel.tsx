"use client";

import { useEffect, useState } from "react";
import { Boxes, Check, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { formatDate } from "@/lib/format";
import { adjustStock, listStockMovements, type StockMovement } from "@/lib/admin";
import { cn } from "@/lib/utils";

/**
 * Inventário (painel admin): ajuste direto de stock (contagem física), alerta
 * implícito (lista ordenada pelo menor stock) e histórico de movimentos.
 * O ajuste usa o endpoint PATCH /api/admin/stock/products/{id}, que grava o
 * movimento e invalida a cache do catálogo.
 */
export function AdminStockPanel() {
  const [threshold, setThreshold] = useState("10");
  const [lowStock, setLowStock] = useState<{ id: string; name: string; stock: number }[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (t: number) => {
    setLoading(true);
    setError(null);
    try {
      // O alerta de stock baixo é a própria listagem ordenada por stock.
      const res = await fetch(`/api/admin/stock/low?threshold=${t}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao carregar");
      setLowStock(json.data.products);
      setMovements(await listStockMovements(undefined, 50));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar inventário");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // queueMicrotask: o setState do loading não pode disparar dentro do efeito
    // (regra react-hooks/set-state-in-effect).
    queueMicrotask(() => void load(10));
  }, []);

  const saveAdjust = async () => {
    if (!adjusting) return;
    const value = parseInt(adjusting.value, 10);
    if (!Number.isFinite(value) || value < 0) {
      setError("Stock inválido — use um número ≥ 0");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adjustStock(adjusting.id, value, "Ajuste manual no painel");
      setAdjusting(null);
      const t = parseInt(threshold, 10);
      await load(Number.isFinite(t) ? t : 10);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação falhou");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-end gap-2">
          <label className="text-sm">
            <span className="font-semibold text-slate-700">Alerta de stock baixo</span>
            <Input
              type="number"
              min={0}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="mt-1 w-28"
            />
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(parseInt(threshold, 10) || 10)}
            disabled={loading}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Aplicar
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-10">
          <Loader2 className="size-7 animate-spin text-primary-600" />
        </div>
      )}

      {!loading && lowStock.length === 0 && !error && (
        <EmptyState
          icon={Boxes}
          title="Nenhum produto em stock baixo"
          description={`Nenhum produto com stock ≤ ${threshold}. Bom sinal!`}
        />
      )}

      {!loading && lowStock.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">
            {lowStock.length} produto{lowStock.length === 1 ? "" : "s"} com stock ≤ {threshold}
          </p>
          {lowStock.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-surface p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-display font-bold text-slate-900">{p.name}</p>
                <p className="text-xs text-slate-400">
                  {p.id} · stock atual: <strong className={cn(p.stock <= 3 ? "text-red-600" : "text-amber-700")}>{p.stock}</strong>
                </p>
              </div>
              {adjusting?.id === p.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={adjusting.value}
                    onChange={(e) => setAdjusting({ id: p.id, value: e.target.value })}
                    className="w-24"
                    autoFocus
                  />
                  <Button size="sm" onClick={() => void saveAdjust()} loading={busy}>
                    <Check className="size-3.5" /> Guardar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setAdjusting(null)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setAdjusting({ id: p.id, value: String(p.stock) })}>
                  Ajustar stock
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && movements.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-slate-500">
            Últimos movimentos de stock
          </h3>
          <div className="rounded-2xl border border-slate-100 bg-surface">
            {movements.map((m, idx) => (
              <div
                key={m.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm",
                  idx > 0 && "border-t border-slate-100",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-slate-700">
                    <span className="font-semibold">{m.productId}</span> · {m.reason}
                    {m.detail ? ` · ${m.detail}` : ""}
                  </p>
                  <p className="text-xs text-slate-400">{formatDate(m.createdAt)}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
                    m.delta < 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700",
                  )}
                >
                  {m.delta > 0 ? "+" : ""}
                  {m.delta}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
