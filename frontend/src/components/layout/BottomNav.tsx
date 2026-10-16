"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingCart, LayoutGrid, Headphones } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth, useAvatarSrc } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();

  // Na página de produto a navegação inferior sai (a pedido): o ecrã fica
  // inteiro para o produto e a saída é a seta do cabeçalho.
  const { user } = useAuth();
  const { count } = useCart();
  const avatarSrc = useAvatarSrc();

  const categoryActive = pathname === "/categorias" || pathname.startsWith("/categoria/");

  if (pathname.startsWith("/produto/") || pathname.startsWith("/checkout")) return null;

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-slate-200 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-surface/85 lg:hidden"
    >
      <ul className="mx-auto max-w-lg grid grid-cols-5">
        <li>
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2 text-xs font-semibold transition",
              pathname === "/" ? "text-primary-700" : "text-slate-500 hover:text-slate-800",
            )}
          >
            <Home className="size-5" />
            Home
          </Link>
        </li>

        <li>
          <Link
            href="/categorias"
            aria-current={categoryActive ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2 text-xs font-semibold transition",
              categoryActive ? "text-primary-700" : "text-slate-500 hover:text-slate-800",
            )}
          >
            <LayoutGrid className="size-5" />
            Categorias
          </Link>
        </li>

        <li>
          <Link
            href="/carrinho"
            aria-current={pathname.startsWith("/carrinho") || pathname.startsWith("/checkout") ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2 text-xs font-semibold transition",
              (pathname.startsWith("/carrinho") || pathname.startsWith("/checkout")) ? "text-primary-700" : "text-slate-500 hover:text-slate-800",
            )}
          >
            <span className="relative">
              <ShoppingCart className="size-5" />
              {count > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </span>
            Carrinho
          </Link>
        </li>

        <li>
          <Link
            href="/suporte"
            aria-current={pathname.startsWith("/suporte") ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2 text-xs font-semibold transition",
              pathname.startsWith("/suporte") ? "text-primary-700" : "text-slate-500 hover:text-slate-800",
            )}
          >
            <Headphones className="size-5" />
            Suporte
          </Link>
        </li>

        <li>
          {user ? (
            <>
              {user.role === "ADMIN" ? (
                <Link
                  href="/admin"
                  aria-label="Painel de administração"
                  aria-current={pathname.startsWith("/admin") ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2 text-xs font-semibold transition",
                    pathname.startsWith("/admin") ? "text-primary-700" : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  <Avatar src={avatarSrc} name={user.fullName} className={cn("size-5 ring-2 ring-offset-1", pathname.startsWith("/admin") ? "ring-primary-600" : "ring-transparent")} textClassName="text-xs" />
                  Conta
                </Link>
              ) : (
                <Link
                  href="/configuracoes"
                  aria-label="Conta"
                  aria-current={pathname.startsWith("/configuracoes") ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2 text-xs font-semibold transition",
                    pathname.startsWith("/configuracoes") ? "text-primary-700" : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  <Avatar src={avatarSrc} name={user.fullName} className={cn("size-5 ring-2 ring-offset-1", pathname.startsWith("/configuracoes") ? "ring-primary-600" : "ring-transparent")} textClassName="text-xs" />
                  Conta
                </Link>
              )}
            </>
          ) : (
            <Link
              href="/configuracoes"
              aria-label="Conta"
              aria-current={pathname.startsWith("/configuracoes") ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-xs font-semibold transition",
                pathname.startsWith("/configuracoes") ? "text-primary-700" : "text-slate-500 hover:text-slate-800",
              )}
            >
              <Avatar src={avatarSrc} name={undefined} className="size-5 ring-2 ring-offset-1 ring-transparent" textClassName="text-xs" />
              Conta
            </Link>
          )}
        </li>
      </ul>
    </nav>
  );
}