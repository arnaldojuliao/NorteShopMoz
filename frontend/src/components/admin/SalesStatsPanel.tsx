"use client";

import { AlertTriangle, BarChart3, PackageSearch, RefreshCw, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useCurrency } from "@/context/CurrencyContext";
import type { SalesStats } from "@/lib/orders";
import { cn } from "@/lib/utils";

/**
 * Painel de analytics do admin.
 *
 * Puramente de apresentação: recebe as estatísticas já agregadas pelo servidor
 * (`GET /api/orders/admin/stats` — toda a soma é feita em SQL) e desenha os
 * indicadores, o top de produtos e a série diária. Não guarda estado nem faz
 * pedidos — a página trata do carregamento e dos erros.
 *
 * O gráfico é de barras em CSS puro (sem biblioteca): são poucos dias, o valor
 * vem pronto a somar e um gráfico deste tamanho não justifica dependências.
 */
interface SalesStatsPanelProps {
  stats: SalesStats | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "muted";
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-surface p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-display text-xl font-extrabold sm:text-2xl",
          tone === "positive" ? "text-emerald-600" : tone === "muted" ? "text-slate-400" : "text-slate-900",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** Esqueleto enquanto o servidor agrega os números. */
function StatsSkeleton() {
  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-100 bg-surface p-5">
            <div className="h-3 w-24 animate-pulse rounded-lg bg-slate-200/80" />
            <div className="mt-3 h-7 w-32 animate-pulse rounded-lg bg-slate-200/80" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-56 rounded-2xl border border-slate-100 bg-surface p-5">
            <div className="h-4 w-40 animate-pulse rounded-lg bg-slate-200/80" />
            <div className="mt-4 h-40 animate-pulse rounded-xl bg-slate-200/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Formata `2026-09-21` como `21/09` (sem depender do locale do browser). */
function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return month && day ? `${day}/${month}` : iso;
}

export function SalesStatsPanel({ stats, loading, error, onRetry }: SalesStatsPanelProps) {
  const { format } = useCurrency();

  if (loading && !stats) {
    return <StatsSkeleton />;
  }

  if (error && !stats) {
    return (
      <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50/60 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-slate-900">
              Não foi possível carregar as estatísticas
            </h2>
            <p className="mt-1 text-sm text-slate-600">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              <RefreshCw className="size-3.5" /> Tentar novamente
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const maxRevenue = Math.max(1, ...stats.days.map((d) => d.revenue));
  // A série vem do mais recente para o mais antigo; o gráfico lê-se da esquerda
  // (mais antigo) para a direita (mais recente).
  const days = [...stats.days].reverse();

  return (
    <div className="mt-6 space-y-6">
      {/* Indicadores principais */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Receita confirmada"
          value={format(stats.revenue)}
          // "por pedido pago": o ticket médio divide a receita confirmada pelos
          // pedidos que a geraram — não pelo total (que inclui cancelados e
          // pedidos offline ainda por pagar).
          hint={`Ticket médio ${format(stats.avgOrderValue)} por pedido pago`}
          tone="positive"
        />
        <Kpi
          label="Pedidos"
          value={String(stats.totalOrders)}
          hint={`${stats.inProgressOrders} em progresso`}
        />
        <Kpi label="Entregues" value={String(stats.deliveredOrders)} tone="positive" />
        <Kpi
          label="Cancelados"
          value={String(stats.cancelledOrders)}
          hint={stats.cancelledValue > 0 ? `${format(stats.cancelledValue)} perdidos` : undefined}
          tone={stats.cancelledOrders > 0 ? "default" : "muted"}
        />
      </section>

      {/* Indicadores secundários */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Portes cobrados" value={format(stats.shippingCollected)} />
        <Kpi label="Descontos concedidos" value={format(stats.discountsGiven)} />
        <Kpi label="Valor cancelado" value={format(stats.cancelledValue)} tone="muted" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Produtos mais vendidos */}
        <section className="rounded-2xl border border-slate-100 bg-surface p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
            <TrendingUp className="size-5 text-primary-600" /> Produtos mais vendidos
          </h2>
          {stats.topProducts.length === 0 ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <PackageSearch className="size-4" /> Ainda não há vendas registadas.
            </p>
          ) : (
            <ol className="mt-4 space-y-3">
              {stats.topProducts.map((product, index) => {
                const top = stats.topProducts[0]?.revenue || 1;
                const width = Math.max(4, Math.round((product.revenue / top) * 100));
                return (
                  <li key={product.productId}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-semibold text-slate-700">
                        <span className="mr-2 text-slate-400">{index + 1}.</span>
                        {product.name || product.productId}
                      </span>
                      <span className="shrink-0 font-bold text-slate-900">{format(product.revenue)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-primary-500"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* Vendas por dia */}
        <section className="rounded-2xl border border-slate-100 bg-surface p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
            <BarChart3 className="size-5 text-primary-600" /> Vendas por dia
          </h2>
          {days.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Sem pedidos nos últimos dias.</p>
          ) : (
            <>
              <div className="mt-5 flex h-40 items-end gap-1.5 sm:gap-2">
                {days.map((day) => (
                  <div
                    key={day.date}
                    className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                    title={`${shortDate(day.date)} · ${day.orders} pedido${day.orders === 1 ? "" : "s"} · ${format(day.revenue)}`}
                  >
                    <span className="h-full w-full flex items-end">
                      <span
                        className={cn(
                          "w-full rounded-t-md bg-primary-500/80 transition group-hover:bg-primary-600",
                          day.revenue === 0 && "bg-slate-200",
                        )}
                        style={{
                          height: `${Math.max(2, Math.round((day.revenue / maxRevenue) * 100))}%`,
                        }}
                      />
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {shortDate(day.date)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {days.length} dia{days.length === 1 ? "" : "s"} com atividade · receita confirmada por dia
                (passa o cursor para ver os detalhes).
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
