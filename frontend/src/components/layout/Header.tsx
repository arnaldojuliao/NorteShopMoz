"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Heart,
  LayoutGrid,
  MapPin,
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
import { categories } from "@/lib/data/categories";
import { SearchCombobox } from "@/components/layout/SearchCombobox";
import { cn } from "@/lib/utils";

const secondaryLinks = [
  { label: "Ofertas", href: "/explore?deal=1" },
  { label: "Novidades", href: "/explore?new=1" },
  { label: "Mais vendidos", href: "/explore?bestseller=1" },
];

function SearchForm({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  return (
    <SearchCombobox className={cn(className)} autoFocus={autoFocus} />
  );
}

function CartButton({ className }: { className?: string }) {
  const { count, bump } = useCart();
  return (
    <Link
      href="/carrinho"
      aria-label={`Carrinho de compras, ${count} itens`}
      className={cn("group relative flex items-center gap-2 rounded-xl px-2.5 py-2 transition hover:bg-slate-100", className)}
    >
      <span className="relative" key={bump}>
        <ShoppingCart
          className={cn("size-6 text-slate-700 transition group-hover:text-primary-700", bump > 0 && "animate-cart-pop")}
        />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white shadow-sm">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      <span className="hidden text-sm font-semibold text-slate-700 lg:inline">Carrinho</span>
    </Link>
  );
}

export function Header() {
  const { user } = useAuth();
  const { count: favCount } = useFavorites();
  const { openLogin } = useLoginModal();
  const [scrolled, setScrolled] = useState(false);
  // O painel de categorias abre por CSS (`group-hover` / `group-focus-within`).
  // Este estado existe só para o `aria-expanded` dizer a verdade a quem usa
  // leitor de ecrã (antes ficava sempre "false").
  const [catOpen, setCatOpen] = useState(false);
  // Foto de perfil: do servidor quando há sessão, para cada conta ter a sua.
  const avatarSrc = useAvatarSrc();

  const accountName = user?.fullName ?? null;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const catLinks = secondaryLinks;

  return (
    <header className="sticky top-0 z-50 bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      {/* Barra de anúncio — visível também no telemóvel (era `hidden md:block`,
          o que escondia a mensagem de entrega nacional de quem mais a lê). */}
      <div className="bg-navy-900 text-white">
        <div className="container-nsm flex h-9 items-center justify-center gap-4 text-xs font-medium sm:justify-between sm:gap-6">
          <p className="flex items-center gap-1.5">
            <Truck className="size-3.5" aria-hidden /> Entrega para todo Moçambique
          </p>
          <p className="hidden items-center gap-1.5 sm:flex">
            <MapPin className="size-3.5" aria-hidden /> Pagamento na entrega disponível
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
          "container-nsm flex items-center gap-3 py-3 transition-all duration-300",
          scrolled && "py-2",
        )}
      >
        <Logo className="shrink-0" />

        <SearchForm className="hidden flex-1 max-w-2xl md:block" />

        <div className="ml-auto hidden items-center gap-1 md:ml-2 md:flex">
          {user ? (
            <Link
              href={user.role === "ADMIN" ? "/admin" : "/configuracoes"}
              aria-label={user.role === "ADMIN" ? "Painel de administração" : "Definições"}
              className="hidden items-center gap-2 rounded-xl px-2.5 py-2 transition hover:bg-slate-100 md:flex"
            >
              <Avatar src={avatarSrc} name={user.fullName} className="size-8" textClassName="text-xs" />
              <span className="text-left leading-tight">
                <span className="block text-xs text-slate-400">
                  {user.role === "ADMIN" ? "Painel" : accountName ? "Bem-vindo," : "Conta"}
                </span>
                <span className="block max-w-[9rem] truncate text-sm font-semibold text-slate-800">
                  {user.role === "ADMIN" ? "Administração" : accountName}
                </span>
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={openLogin}
              aria-label="Entrar ou registar-se"
              className="hidden items-center gap-2 rounded-xl px-2.5 py-2 transition hover:bg-slate-100 md:flex"
            >
              <Avatar src={avatarSrc} name={undefined} className="size-8" textClassName="text-xs" />
              <span className="text-left leading-tight">
                <span className="block text-xs text-slate-400">Conta</span>
                <span className="block max-w-[9rem] truncate text-sm font-semibold text-slate-800">
                  Entrar / Registar-se
                </span>
              </span>
            </button>
          )}

          <Link
            href="/favoritos"
            aria-label={`Favoritos, ${favCount} itens`}
            className="relative hidden rounded-xl p-2.5 text-slate-700 transition hover:bg-slate-100 hover:text-primary-700 sm:block"
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

      {/* Pesquisa no mobile */}
      <div className="container-nsm pb-2.5 md:hidden">
        <SearchForm />
      </div>

      {/* Segunda linha — navegação desktop */}
      <nav
        aria-label="Categorias"
        className="hidden border-t border-slate-100 lg:block"
      >
        <div className="container-nsm flex items-center gap-1 py-0">
          <div
            className="group relative"
            onMouseEnter={() => setCatOpen(true)}
            onMouseLeave={() => setCatOpen(false)}
            onFocus={() => setCatOpen(true)}
            onBlur={() => setCatOpen(false)}
          >
            <button
              aria-haspopup="true"
              aria-expanded={catOpen}
              className="flex h-9 items-center gap-2 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white shadow-sm shadow-brand/25 transition hover:bg-brand-strong"
            >
              <LayoutGrid className="size-4" />
              Todas as categorias
              <ChevronDown className="size-3.5 opacity-80 transition-transform group-hover:rotate-180" />
            </button>
            <div className="invisible absolute left-0 top-full z-50 grid w-72 grid-cols-1 gap-0 overflow-hidden rounded-2xl border border-slate-100 bg-surface p-2 opacity-0 shadow-card transition-all duration-200 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              {categories.map((c) => (
                <Link
                  key={c.slug}
                  href={`/categoria/${c.slug}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-primary-50 hover:text-primary-700"
                >
                  <span>{c.emoji}</span>
                  {c.name}
                </Link>
              ))}
            </div>
          </div>

          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />

          {catLinks.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="flex h-11 items-center px-3 text-sm font-medium text-slate-600 transition hover:text-primary-700"
            >
              {l.label}
            </Link>
          ))}

          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />

          <div className="relative flex items-center">
            {categories.slice(0, 7).map((c) => (
              <Link
                key={c.slug}
                href={`/categoria/${c.slug}`}
                className="flex h-11 items-center px-2.5 text-sm text-slate-600 transition hover:text-primary-700"
              >
                {c.name}
              </Link>
            ))}
          </div>

          <div className="ml-auto flex items-center">
            <span className="hidden items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700 xl:flex">
              <ChevronDown className="size-3.5" /> Pagamento na entrega
            </span>
          </div>
        </div>
      </nav>

      </header>
  );
}
