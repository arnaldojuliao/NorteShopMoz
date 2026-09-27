"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, MessageCircle, ShoppingCart, User } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth, useAvatarSrc } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { cn } from "@/lib/utils";
import { whatsappHref } from "@/config/site";

const items = [
  { label: "Home", href: "/", icon: Home },
  { label: "Categoria", href: "/categorias", icon: LayoutGrid },
  { label: "Carrinho", href: "/carrinho", icon: ShoppingCart },
  { label: "Mensagens", href: whatsappHref(), icon: MessageCircle, external: true },
  { label: "Conta", href: "/configuracoes", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { count } = useCart();
  // Foto de perfil: do servidor quando há sessão, para cada conta ter a sua.
  const avatarSrc = useAvatarSrc();

  const isActive = (href: string) => {
    if (href.startsWith("http")) return false;
    if (href === "/") return pathname === "/";
    if (href === "/carrinho") {
      return pathname.startsWith("/carrinho") || pathname.startsWith("/checkout");
    }
    if (href === "/categorias") {
      return pathname === "/categorias" || pathname.startsWith("/categoria/");
    }
    return pathname.startsWith(href);
  };

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-slate-200 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-surface/85 lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          // Sessão iniciada: o círculo com a foto (ou a inicial) substitui o ícone
          // genérico — admin vai ao painel, cliente às configurações.
          if (item.label === "Conta" && user) {
            const isAdmin = user.role === "ADMIN";
            const accountActive = isAdmin ? pathname.startsWith("/admin") : active;
            return (
              <li key={item.label}>
                <Link
                  href={isAdmin ? "/admin" : "/configuracoes"}
                  aria-label={isAdmin ? "Painel de administração" : "Conta"}
                  aria-current={accountActive ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2 text-xs font-semibold transition",
                    accountActive ? "text-primary-700" : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  <Avatar
                    src={avatarSrc}
                    name={user.fullName}
                    className={cn(
                      "size-5 ring-2 ring-offset-1",
                      accountActive ? "ring-primary-600" : "ring-transparent",
                    )}
                    textClassName="text-xs"
                  />
                  {item.label}
                </Link>
              </li>
            );
          }
          const linkClass = cn(
            "flex flex-col items-center gap-1 py-2 text-xs font-semibold transition",
            active ? "text-primary-700" : "text-slate-500 hover:text-slate-800",
          );
          return (
            <li key={item.label}>
              {item.external ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  <Icon className="size-5" />
                  {item.label}
                </a>
              ) : (
                <Link
                  href={item.href}
                  className={linkClass}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="relative">
                    <Icon className="size-5" />
                    {item.label === "Carrinho" && count > 0 && (
                      <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white">
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </span>
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
