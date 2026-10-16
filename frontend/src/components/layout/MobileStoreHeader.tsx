"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { ChevronLeft, Heart, Share2 } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { CategoryStrip } from "@/components/layout/CategoryStrip";
import { SearchCombobox } from "@/components/layout/SearchCombobox";
import { useFavorites } from "@/context/FavoritesContext";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho mobile das páginas de loja — **só** na home, em `/categorias` e em
 * `/carrinho`, e **só** abaixo do breakpoint `md` (o mesmo que separa o
 * cabeçalho mobile do desktop no resto do site). Nestas três rotas o `Header`
 * continua a ser o cabeçalho do desktop: os dois são renderizados e alternados
 * por CSS, para não haver duas árvores de markup nem saltos de hidratação.
 *
 * Organização (duas linhas):
 *  1. marca compacta + campo de pesquisa (com botão de lupa) + favoritos;
 *  2. faixa de categorias — o mesmo componente `CategoryStrip` do `Header`,
 *     portanto os mesmos dados, `href` e eventos de clique.
 *
 * A faixa de entrega («Entrega para todo Moçambique») foi removida do mobile
 * a pedido — o cabeçalho ficou mais curto (105px). O desktop mantém a sua
 * barra de anúncio, no `Header`.
 *
 * Não há aqui ícones de mensagens/notificações porque o projeto não tem essa
 * funcionalidade (só preferências de notificação, em `/configuracoes`).
 */
export function MobileStoreHeader({ className }: { className?: string }) {
  const { count: favCount } = useFavorites();
  const { notify } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  // Na página de produto o cabeçalho muda de papel: seta de recuo no lugar do
  // logo, partilhar no lugar dos favoritos e sem faixa de categorias.
  const isProduct = pathname.startsWith("/produto/");
  // Em todas as rotas com cabeçalho mobile, EXCETO /categorias: o cabeçalho
  // esconde-se ao rolar para BAIXO e volta ao rolar para CIMA (comportamento
  // de app de compras). Em /categorias fica sempre fixo, a pedido.
  // `lastY` guarda o último Y; só muda de estado com delta > 4px para não
  // tremular com micro-gestos e `y < 80` garante o topo sempre com cabeçalho.
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const hideOnScroll = pathname !== "/categorias";

  useEffect(() => {
    if (!hideOnScroll) return;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (y < 80) {
        setHidden(false);
      } else if (delta > 4) {
        setHidden(true);
      } else if (delta < -4) {
        setHidden(false);
      }
      lastY.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hideOnScroll]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 bg-gradient-to-r from-header to-header-strong text-white shadow-md shadow-header/20 transition-transform duration-300 ease-out md:hidden",
        hideOnScroll && hidden && "-translate-y-full",
        className,
      )}
    >
      {/* Linha 1 — marca, pesquisa e favoritos */}
      <div className="container-nsm flex items-center gap-2 py-2">
        {/* Logótipo atual, na variante compacta (monograma) já usada pela marca
            em ecrãs pequenos: com o campo de pesquisa ao lado, a assinatura
            completa não caberia sem cortar ou sobrepor. */}
        {isProduct ? (
          <button
            type="button"
            onClick={() => {
              // Volta à secção anterior (de onde veio). Se a página foi aberta
              // diretamente (link partilhado, sem histórico do site), leva ao
              // início em vez de sair da loja.
              const sameSite = document.referrer.startsWith(window.location.origin);
              if (sameSite && window.history.length > 1) {
                router.back();
              } else {
                router.push("/");
              }
            }}
            aria-label="Voltar"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/15 active:scale-95"
          >
            <ChevronLeft className="size-7" strokeWidth={3} aria-hidden />
          </button>
        ) : (
          <Logo compact light className="shrink-0" />
        )}

        <SearchCombobox
          className="min-w-0 flex-1"
          withSubmitButton
          submitButtonClassName="bg-white text-header-strong hover:bg-white/90"
        />

        {isProduct ? (
          <button
            type="button"
            onClick={() => {
              const url = window.location.href;
              if (navigator.share) {
                navigator.share({ title: document.title, url }).catch(() => {});
              } else {
                navigator.clipboard
                  .writeText(url)
                  .then(() => notify("Link copiado para a área de transferência 📋"))
                  .catch(() => notify("Não foi possível partilhar.", "error"));
              }
            }}
            aria-label="Partilhar produto"
            className="flex shrink-0 items-center justify-center rounded-xl p-2.5 text-white transition hover:bg-white/15 active:scale-95"
          >
            <Share2 className="size-6" />
          </button>
        ) : (
          <Link
            href="/favoritos"
            aria-label={`Favoritos, ${favCount} itens`}
            className="relative flex shrink-0 items-center justify-center rounded-xl p-2.5 text-white transition hover:bg-white/15"
          >
            <Heart className="size-6" />
            {favCount > 0 && (
              <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-xs font-bold text-white">
                {favCount}
              </span>
            )}
          </Link>
        )}
      </div>

      {/* Linha 2 — categorias (mesma navegação do cabeçalho grande).
          Em `/categorias` a faixa some: a própria página tem o carril fixo de
          17 categorias à esquerda e duplicar a navegação só polui o ecrã. */}
      <CategoryStrip hiddenOn={["/categorias", "/produto"]} />
    </header>
  );
}
