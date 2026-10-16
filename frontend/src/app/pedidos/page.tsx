"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  MessageSquare,
  Package,
  RefreshCw,
  Search,
  SearchX,
  ShieldCheck,
  X,
} from "lucide-react";
import { AccountGuard } from "@/components/account/AccountGuard";
import { AccountSidebar } from "@/components/account/AccountSidebar";
import { OrderCard, OrderCardSkeleton } from "@/components/account/OrderCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductGridSkeleton } from "@/components/ui/Skeleton";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";
import { repo } from "@/lib/repo";
import { useAccountOrders } from "@/lib/useAccountOrders";
import {
  ORDER_TABS,
  orderMatchesTab,
  tabCounts,
  type OrderTabId,
} from "@/lib/orderStatus";
import type { Order, Product } from "@/lib/types";
import { listMyReturns, type ReturnRequestItem, type ReturnStatus } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { whatsappHref } from "@/config/site";

/** Quantos esqueletos mostrar durante o carregamento. */
const SKELETON_COUNT = 3;

/** Separações válidas de `/pedidos?estado=` (senão cai em "todos"). */
function parseTab(value: string | null): OrderTabId {
  return (ORDER_TABS.find((t) => t.id === value)?.id ?? "todos") as OrderTabId;
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<OrdersFallback />}>
      <AccountGuard>
        <OrdersView />
      </AccountGuard>
    </Suspense>
  );
}

/** Esqueleto de página — usado enquanto o Suspense resolve os parâmetros de URL. */
function OrdersFallback() {
  return (
    <div className="container-nsm py-6">
      <ProductGridSkeleton count={SKELETON_COUNT} />
    </div>
  );
}

function OrdersView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { addItem } = useCart();
  const { notify } = useToast();

  const { orders, phase, reload, orderOf, cancel, cancellingId } = useAccountOrders();

  const activeTab = parseTab(searchParams.get("estado"));

  // Pesquisa: só filtra quando aplicada (Enter/botão), para não reordenar a
  // lista a cada tecla.
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");

  const clearSearch = () => {
    setQuery("");
    setApplied("");
  };

  const selectTab = (id: OrderTabId) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "todos") params.delete("estado");
    else params.set("estado", id);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Mantém o separador ativo à vista na fila horizontal (telemóvel/tablet): sem
  // isto, escolher "Devoluções" na sidebar deixava-o fora do ecrã.
  const tabRefs = useRef<Partial<Record<OrderTabId, HTMLButtonElement | null>>>({});
  useEffect(() => {
    tabRefs.current[activeTab]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTab]);

  // Contadores das tabs sobre o conjunto completo (não o filtrado pela pesquisa).
  const counts = useMemo(() => tabCounts(orders), [orders]);

  // Devoluções já registadas (por pedido): quando a conta tem sessão real, o
  // backend devolve-as; com sessão local sem conta (ou API em baixo), falha em
  // silêncio e a loja comporta-se como antes (o fluxo de devolução só se
  // ativa com dados reais).
  const [returnStatuses, setReturnStatuses] = useState<Record<string, ReturnStatus>>({});
  useEffect(() => {
    let alive = true;
    listMyReturns()
      .then((returns: ReturnRequestItem[]) => {
        if (!alive) return;
        const map: Record<string, ReturnStatus> = {};
        for (const r of returns) map[r.orderId] = r.status;
        setReturnStatuses(map);
      })
      .catch(() => {
        // Sem devoluções conhecidas — o card mostra o fluxo normal.
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleReturnUpdated = (item: ReturnRequestItem) => {
    setReturnStatuses((prev) => ({ ...prev, [item.orderId]: item.status }));
    notify("Devolução pedida — a loja responderá por email.");
  };

  // Filtro de pesquisa (número do pedido, nome ou slug do produto).
  const searched = useMemo(() => {
    const q = applied.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const full = orderOf(o);
      return (
        full.id.toLowerCase().includes(q) ||
        full.items.some(
          (i) => i.name.toLowerCase().includes(q) || i.slug.toLowerCase().includes(q),
        )
      );
    });
  }, [orders, applied, orderOf]);

  const visible = useMemo(
    () => searched.filter((o) => orderMatchesTab(orderOf(o), ORDER_TABS.find((t) => t.id === activeTab)!)),
    [searched, activeTab, orderOf],
  );

  // Catálogo para o "Comprar novamente" (mapeia o item para o produto atual).
  const [catalog, setCatalog] = useState<Product[]>([]);
  useEffect(() => {
    let alive = true;
    repo
      .getProducts()
      .then((all) => {
        if (alive) setCatalog(all);
      })
      .catch(() => {
        /* sem catálogo o botão avisa que não está disponível */
      });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Volta a pôr no carrinho os artigos de um pedido que ainda existam e tenham
   * stock. Nunca inventa disponibilidade: se nada puder ser adicionado, avisa.
   */
  const handleReorder = (order: Order) => {
    const full = orderOf(order);
    let added = 0;
    let unavailable = 0;
    for (const item of full.items) {
      const product = catalog.find((p) => p.id === item.productId || p.slug === item.slug);
      if (product && product.stock > 0) {
        addItem(product, item.qty, item.variant);
        added += 1;
      } else {
        unavailable += 1;
      }
    }
    if (added === 0) {
      notify("Estes artigos não estão disponíveis neste momento.", "error");
    } else if (unavailable > 0) {
      notify(`${added} artigo(s) adicionados. ${unavailable} indisponível(is).`, "error");
    } else {
      notify("Artigos adicionados ao carrinho.");
    }
  };

  const hasOrders = orders.length > 0;
  const tabMissing = ORDER_TABS.find((t) => t.id === activeTab)!;
  /** Mensagem do separador sem pedidos ("Devoluções" não é um estado do backend). */
  const emptyTabText =
    activeTab === "devolucoes"
      ? "Nenhum pedido entregue está dentro da janela de devolução."
      : `Não há pedidos em ${tabMissing.label.toLowerCase()}.`;

  return (
    <div className="container-nsm py-6">

      <div className="mt-4 grid gap-6 md:grid-cols-[3.5rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* Menu da conta: coluna completa no desktop, só ícones no tablet. */}
        <aside className="hidden md:block">
          <div className="sticky top-24 hidden lg:block">
            <AccountSidebar variant="desktop" activeTab={activeTab} counts={counts} />
          </div>
          <div className="sticky top-24 lg:hidden">
            <AccountSidebar variant="rail" activeTab={activeTab} />
          </div>
        </aside>

        <div className="min-w-0">
          {/* Título + pesquisa */}
          <div className="flex flex-col gap-4 md:mt-0 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-extrabold text-slate-900 sm:text-3xl">Meus pedidos</h1>
              <p className="mt-1 text-sm text-slate-500">
                Acompanha as tuas compras e consulta o histórico de encomendas.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setApplied(query.trim());
              }}
              role="search"
              className="flex w-full items-center gap-2 md:max-w-sm"
            >
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Pesquisar por número do pedido ou produto..."
                  aria-label="Pesquisar por número do pedido ou produto"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-surface pl-10 pr-9 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/15 focus:outline-none"
                />
                {(query || applied) && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    aria-label="Limpar pesquisa"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </div>
              {/* No telemóvel o rótulo fica escondido: o botão precisa do nome
                  acessível próprio (sem ele não tinha nome nenhum). */}
              <Button
                type="submit"
                size="md"
                aria-label="Pesquisar pedidos"
                className="shrink-0"
              >
                <Search className="size-4" aria-hidden />
                <span className="hidden sm:inline">Pesquisar</span>
              </Button>
            </form>
          </div>

          {/* Separadores de estado */}
          <div
            role="tablist"
            aria-label="Filtrar pedidos por estado"
            className="no-scrollbar -mx-4 mt-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
          >
            {ORDER_TABS.map((tab) => {
              const isActive = tab.id === activeTab;
              const count = counts[tab.id];
              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabRefs.current[tab.id] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => selectTab(tab.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold transition",
                    isActive
                      ? "bg-primary-50 text-primary-700"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
                  )}
                >
                  {tab.label}
                  {count > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums",
                        isActive ? "bg-brand text-white" : "bg-slate-100 text-slate-500",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Área de pedidos */}
          <div className="mt-5">
            {phase === "loading" && (
              <div className="space-y-4" aria-busy="true" aria-label="A carregar pedidos">
                {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                  <OrderCardSkeleton key={i} />
                ))}
              </div>
            )}

            {phase === "error" && (
              <div className="rounded-2xl border border-red-100 bg-red-50/60 p-6 text-center">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-surface text-red-600 shadow-card">
                  <AlertCircle className="size-6" aria-hidden />
                </div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Não foi possível carregar os teus pedidos
                </h2>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                  Houve um problema a contactar a loja. Os teus pedidos não foram perdidos — tenta novamente.
                </p>
                <Button onClick={reload} className="mt-4">
                  <RefreshCw className="size-4" aria-hidden />
                  Tentar novamente
                </Button>
              </div>
            )}

            {phase === "ready" && !hasOrders && (
              <EmptyState
                icon={Package}
                title="Ainda não tens pedidos"
                description="Quando fizeres a tua primeira compra na NorteShopMoz, poderás acompanhar a tua encomenda aqui."
                actionLabel="Explorar produtos"
                actionHref="/explore"
              />
            )}

            {phase === "ready" && hasOrders && searched.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface text-slate-400 shadow-card">
                  <SearchX className="size-7" aria-hidden />
                </div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Não encontrámos pedidos correspondentes.
                </h2>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                  Confirma o número do pedido ou o nome do produto e tenta de novo.
                </p>
                <Button onClick={clearSearch} variant="outline" className="mt-4">
                  <X className="size-4" aria-hidden />
                  Limpar pesquisa
                </Button>
              </div>
            )}

            {phase === "ready" && hasOrders && searched.length > 0 && visible.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface text-slate-400 shadow-card">
                  <Package className="size-7" aria-hidden />
                </div>
                <h2 className="font-display text-lg font-bold text-slate-900">Sem pedidos neste estado</h2>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                  {emptyTabText} Vê todos os pedidos para o histórico completo.
                </p>
                <Button onClick={() => selectTab("todos")} variant="outline" className="mt-4">
                  Ver todos os pedidos
                </Button>
              </div>
            )}

            {/* Um erro de rede não apaga o que já estava em ecrã: o aviso fica
                acima e a lista (em cache) continua acessível. */}
            {phase !== "loading" && visible.length > 0 && (
              <div className="space-y-4">
                {visible.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={orderOf(o)}
                    cancelling={cancellingId === o.id}
                    onCancel={() => void cancel(o)}
                    onReorder={() => handleReorder(o)}
                    returnStatus={returnStatuses[o.id] ?? null}
                    onReturnUpdated={handleReturnUpdated}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Cartões informativos — só fazem sentido quando há pedidos. */}
          {phase !== "loading" && hasOrders && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <section className="rounded-2xl border border-slate-100 bg-surface p-4 shadow-card">
                <h2 className="flex items-center gap-2 font-display text-sm font-extrabold text-slate-900">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                    <ShieldCheck className="size-4" aria-hidden />
                  </span>
                  Compra com confiança
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  Consulta as informações de entrega, o estado da encomenda e as opções de suporte
                  disponíveis para cada pedido.
                </p>
                <Button href="/ajuda" variant="ghost" size="sm" className="mt-2 -ml-3.5">
                  Ver a página de ajuda
                </Button>
              </section>

              <section className="rounded-2xl border border-slate-100 bg-surface p-4 shadow-card">
                <h2 className="flex items-center gap-2 font-display text-sm font-extrabold text-slate-900">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                    <MessageSquare className="size-4" aria-hidden />
                  </span>
                  Não encontras o teu pedido?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  Se compraste com outro email, procura o número do pedido que recebeste por email ou
                  fala com o suporte.
                </p>
                <Button
                  href={whatsappHref("Olá! Preciso de ajuda a localizar um pedido.")}
                  target="_blank"
                  variant="ghost"
                  size="sm"
                  className="mt-2 -ml-3.5"
                >
                  Falar com o suporte
                </Button>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}