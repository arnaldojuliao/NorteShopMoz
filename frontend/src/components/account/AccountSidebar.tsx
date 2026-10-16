"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Ban,
  Bell,
  ChevronDown,
  Clock,
  CreditCard,
  Heart,
  MapPin,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  Star,
  Truck,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ORDER_TABS, type OrderTabId } from "@/lib/orderStatus";

/**
 * Menu lateral da conta.
 *
 * Cada entrada aponta para uma rota (ou separador de `/pedidos`) que já existe
 * no projeto — nada de destinos inventados. As opções sem página própria (ex.:
 * segurança, notificações) levam ao bloco correspondente em `/configuracoes`.
 *
 * Três apresentações do MESMO conjunto de itens:
 *  - `desktop` → lista completa numa coluna;
 *  - `rail`    → só ícones (tablet, onde a largura é escassa);
 *  - `mobile`  → um seletor compacto que abre a lista (sem ocupar o ecrã todo).
 */

type Item = {
  label: string;
  icon: LucideIcon;
  href: string;
  /** Separador de `/pedidos` a ativar (quando aplicável). */
  tab?: OrderTabId;
};

export const ACCOUNT_ITEMS: Item[] = [
  // «Dados de entrega» substitui «Meus pedidos» (a pedido): os pedidos continuam
  // acessíveis pelos separadores abaixo e a navegação prioritária passa a ser o
  // livro de endereços — o cliente nunca repete os dados de entrega.
  { label: "Dados de entrega", icon: Truck, href: "/configuracoes#enderecos" },
  { label: "A processar", icon: Clock, href: "/pedidos?estado=a-processar", tab: "a-processar" },
  { label: "Enviados", icon: PackageCheck, href: "/pedidos?estado=enviados", tab: "enviados" },
  { label: "Entregues", icon: PackageCheck, href: "/pedidos?estado=entregues", tab: "entregues" },
  { label: "Cancelados", icon: Ban, href: "/pedidos?estado=cancelados", tab: "cancelados" },
  { label: "Devoluções e reembolsos", icon: RotateCcw, href: "/pedidos?estado=devolucoes", tab: "devolucoes" },
  { label: "Favoritos", icon: Heart, href: "/favoritos" },
  { label: "Endereços", icon: MapPin, href: "/configuracoes#enderecos" },
  { label: "Métodos de pagamento", icon: CreditCard, href: "/pagamentos" },
  { label: "Perfil", icon: User, href: "/configuracoes#perfil" },
  { label: "Segurança da conta", icon: ShieldCheck, href: "/configuracoes#seguranca" },
  { label: "Notificações", icon: Bell, href: "/configuracoes#notificacoes" },
];

/** Rótulos dos separadores de `/pedidos` (para a sidebar marcar o ativo). */
const TAB_LABEL: Record<OrderTabId, string> = ORDER_TABS.reduce(
  (acc, t) => ({ ...acc, [t.id]: t.label }),
  {} as Record<OrderTabId, string>,
);

function isActive(item: Item, pathname: string, activeTab: OrderTabId): boolean {
  if (item.href.startsWith("/pedidos")) {
    // Um item de pedidos só fica ativo quando o separador corresponde; assim só
    // uma entrada está destacada de cada vez.
    return pathname.startsWith("/pedidos") && item.tab === activeTab;
  }
  if (item.href === "/favoritos") return pathname.startsWith("/favoritos");
  if (item.href === "/pagamentos") return pathname.startsWith("/pagamentos");
  // As restantes apontam para /configuracoes: nunca ficam "ativas" por URL (não
  // há secção própria na rota), evitando seis itens acesos ao mesmo tempo.
  return false;
}

function itemClasses(active: boolean, rail = false) {
  return cn(
    "group flex items-center rounded-xl transition-colors",
    rail ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
    active
      ? "bg-primary-50 font-semibold text-primary-700"
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
  );
}

/** Indicador visual na lateral do item ativo (barra azul discreta). */
function ActiveMarker({ active, rail = false }: { active: boolean; rail?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-brand transition-all",
        rail ? "h-5" : "h-6",
        active ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

function NavList({
  pathname,
  activeTab,
  rail = false,
  onNavigate,
}: {
  pathname: string;
  activeTab: OrderTabId;
  rail?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-0.5">
      {ACCOUNT_ITEMS.map((item) => {
        const active = isActive(item, pathname, activeTab);
        const Icon = item.icon;
        return (
          <li key={item.label} className="relative">
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={rail ? item.label : undefined}
              className={itemClasses(active, rail)}
            >
              <ActiveMarker active={active} rail={rail} />
              <Icon
                className={cn("size-4.5 shrink-0", active ? "text-primary-700" : "text-slate-400")}
                aria-hidden
              />
              {rail ? (
                <span className="sr-only">{item.label}</span>
              ) : (
                <span className="min-w-0 truncate text-sm">{item.label}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AccountSidebar({
  activeTab = "todos",
  variant = "desktop",
  /** Nº de pedidos por separador (mostrado junto ao item, na sidebar completa). */
  counts,
}: {
  activeTab?: OrderTabId;
  variant?: "desktop" | "rail" | "mobile";
  counts?: Record<OrderTabId, number>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (variant === "rail") {
    return (
      <nav aria-label="Menu da conta" className="rounded-2xl border border-slate-100 bg-surface p-2 shadow-card">
        <NavList pathname={pathname} activeTab={activeTab} rail />
      </nav>
    );
  }

  if (variant === "mobile") {
    const current = ACCOUNT_ITEMS.find((i) => isActive(i, pathname, activeTab)) ?? ACCOUNT_ITEMS[0];
    const CurrentIcon = current.icon;
    return (
      <div className="rounded-2xl border border-slate-100 bg-surface shadow-card md:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="account-nav-mobile"
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
            <CurrentIcon className="size-4.5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-slate-400">Menu da conta</span>
            <span className="block truncate text-sm font-semibold text-slate-900">{current.label}</span>
          </span>
          <ChevronDown
            className={cn("size-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>

        {open && (
          <nav id="account-nav-mobile" aria-label="Menu da conta" className="border-t border-slate-100 p-2">
            <NavList pathname={pathname} activeTab={activeTab} onNavigate={() => setOpen(false)} />
          </nav>
        )}
      </div>
    );
  }

  return (
    <nav aria-label="Menu da conta" className="rounded-2xl border border-slate-100 bg-surface p-2 shadow-card">
      <p className="px-3 pb-1.5 pt-2 text-xs font-bold uppercase tracking-wider text-slate-400">A minha conta</p>
      <ul className="space-y-0.5">
        {ACCOUNT_ITEMS.map((item) => {
          const active = isActive(item, pathname, activeTab);
          const Icon = item.icon;
          const count = item.tab ? counts?.[item.tab] : undefined;
          return (
            <li key={item.label} className="relative">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={itemClasses(active)}
              >
                <ActiveMarker active={active} />
                <Icon
                  className={cn("size-4.5 shrink-0", active ? "text-primary-700" : "text-slate-400")}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                {typeof count === "number" && count > 0 && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                      active ? "bg-brand text-white" : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Atalho para avaliar produtos comprados — usa a secção de avaliações que
          já existe na página de produto (não há página própria de avaliações). */}
      <div className="mt-1 border-t border-slate-100 pt-1">
        <Link
          href="/explore"
          className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <Star className="size-4.5 shrink-0 text-slate-400" aria-hidden />
          <span className="min-w-0 truncate text-sm">As minhas avaliações</span>
        </Link>
      </div>
    </nav>
  );
}

export { TAB_LABEL };