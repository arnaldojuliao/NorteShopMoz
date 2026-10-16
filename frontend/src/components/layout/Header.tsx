"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Heart,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Logo } from "@/components/ui/Logo";
import { site, telHref } from "@/config/site";
import { useAuth, useAvatarSrc } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useLoginModal } from "@/context/LoginModalContext";
import { SearchCombobox } from "@/components/layout/SearchCombobox";
import { CategoryStrip } from "@/components/layout/CategoryStrip";
import { cn } from "@/lib/utils";

function SearchForm({ className }: { className?: string }) {
  return <SearchCombobox className={cn(className)} />;
}

function CartButton({ className }: { className?: string }) {
  const { count, bump } = useCart();
  return (
    <Link
      href="/carrinho"
      aria-label={`Carrinho de compras, ${count} itens`}
      className={cn("group relative flex items-center gap-2 rounded-xl px-2.5 py-2 transition hover:bg-white/15", className)}
    >
      <span className="relative" key={bump}>
        <ShoppingCart
          className={cn("size-6 text-white transition group-hover:scale-110", bump > 0 && "animate-cart-pop")}
        />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white shadow-sm">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      <span className="hidden text-sm font-semibold text-white lg:inline">Carrinho</span>
    </Link>
  );
}

/**
 * Cabeçalho do desktop (breakpoint `md` para cima).
 *
 * O mobile tem o seu próprio cabeçalho (`MobileStoreHeader`): aqui já não há
 * nada específico de telemóvel — a pesquisa recolhível ao deslizar e a linha de
 * pesquisa mobile saíram com o cabeçalho antigo, para não ficarem dois desenhos
 * de cabeçalho no mesmo ecrã.
 */
export function Header({ className }: { className?: string }) {
  const { user } = useAuth();
  const { count: favCount } = useFavorites();
  const { openLogin } = useLoginModal();
  // Foto de perfil: do servidor quando há sessão, para cada conta ter a sua.
  const avatarSrc = useAvatarSrc();
  // Compactação do cabeçalho ao rolar — comportamento do desktop (o mobile tem
  // o seu próprio cabeçalho e não depende disto).
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const accountName = user?.fullName ?? null;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 bg-gradient-to-r from-header to-header-strong text-white shadow-md shadow-header/20",
        className,
      )}
    >
      {/* Barra de anúncio — visível também no telemóvel (era `hidden md:block`,
          o que escondia a mensagem de entrega nacional de quem mais a lê). */}
      <div className="bg-navy-900 text-white">
        <div className="container-nsm flex h-8 items-center justify-center gap-4 text-xs font-medium sm:h-9 sm:justify-between sm:gap-6">
          <p className="flex items-center gap-1.5">
            <Truck className="size-3.5" aria-hidden /> Entrega para todo Moçambique
          </p>
          <p className="hidden items-center gap-1.5 md:flex">
            <a href={telHref} className="text-white/80 transition hover:text-white">
              Suporte: {site.phoneDisplay}
            </a>
          </p>
        </div>
      </div>

      {/* Linha principal */}
      <div
        className={cn(
          "container-nsm flex items-center gap-3 py-2 transition-all duration-300 sm:py-3",
          scrolled && "py-1.5 sm:py-2",
        )}
      >
        <Logo className="shrink-0" light />

        <SearchForm className="flex-1 max-w-2xl" />

        <div className="ml-auto flex items-center gap-1 md:ml-2">
          {user ? (
            <Link
              href={user.role === "ADMIN" ? "/admin" : "/configuracoes"}
              aria-label={user.role === "ADMIN" ? "Painel de administração" : "Definições"}
              className="hidden items-center gap-2 rounded-xl px-2.5 py-2 transition hover:bg-white/15 md:flex"
            >
              <Avatar src={avatarSrc} name={user.fullName} className="size-8" textClassName="text-xs" />
              <span className="text-left leading-tight">
                <span className="block text-xs text-white/70">
                  {user.role === "ADMIN" ? "Painel" : accountName ? "Bem-vindo," : "Conta"}
                </span>
                <span className="block max-w-[9rem] truncate text-sm font-semibold text-white">
                  {user.role === "ADMIN" ? "Administração" : accountName}
                </span>
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={openLogin}
              aria-label="Entrar ou registar-se"
              className="hidden items-center gap-2 rounded-xl px-2.5 py-2 transition hover:bg-white/15 md:flex"
            >
              <Avatar src={avatarSrc} name={undefined} className="size-8" textClassName="text-xs" />
              <span className="text-left leading-tight">
                <span className="block text-xs text-white/70">Conta</span>
                <span className="block max-w-[9rem] truncate text-sm font-semibold text-white">
                  Entrar / Registar-se
                </span>
              </span>
            </button>
          )}

          <Link
            href="/favoritos"
            aria-label={`Favoritos, ${favCount} itens`}
            className="relative hidden rounded-xl p-2.5 text-white transition hover:bg-white/15 sm:block"
          >
            <Heart className="size-6" />
            {favCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-xs font-bold text-white">
                {favCount}
              </span>
            )}
          </Link>

          <CartButton />
        </div>
      </div>

      {/* Categorias — mobile e desktop (componente partilhado com o cabeçalho
          mobile). Na página de produto a faixa sai: o foco é o produto. */}
      <CategoryStrip hiddenOn={["/produto"]} />

      </header>
  );
}
