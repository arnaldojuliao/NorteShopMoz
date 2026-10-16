"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { MobileStoreHeader } from "@/components/layout/MobileStoreHeader";

/**
 * Rotas sem o cabeçalho completo.
 *
 * `/categorias` **não** está aqui: é página de navegação da loja (catálogo) e
 * sem o cabeçalho ficava sem pesquisa, sem categorias, sem carrinho e sem forma
 * de voltar a um produto — só o rodapé, no fim de uma página longa. O que fica
 * de fora é a área de conta, o painel de administração, o carrinho, as páginas
 * legais/de ajuda e a recuperação de password, que têm navegação própria
 * (atalhos/bottom nav) e onde o cabeçalho da loja é ruído.
 */
const SINGLE_HEADER_ROUTES = [
  "/configuracoes",
  "/admin",
  // Páginas focadas: legais e recuperação de password têm navegação própria
  // («Voltar para o início de sessão», bottom nav) e o cabeçalho da loja seria
  // ruído.
  "/privacidade",
  "/termos",
  "/recuperar-password",
  "/suporte",
  // Carrinho: foco total na tarefa (a navegação fica no bottom nav mobile e
  // no rodapé do desktop). /pedidos tem o próprio header mobile.
  "/carrinho",
];


/**
 * Cabeçalho do checkout: fixo, com seta de recuo (volta à página anterior) e o
 * título «Finalizar a compra» — foco total na compra, sem navegação nem
 * categorias que convidem a sair a meio. O sinal «Compra segura» vive na
 * própria secção de pagamento do checkout.
 */
function CheckoutHeader() {
  const router = useRouter();
  return (
    <>
      {/* Telemóvel: seta de recuo + título */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-header to-header-strong text-white shadow-md shadow-header/20">
        <div className="container-nsm flex h-14 items-center gap-1.5">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Voltar"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/15 active:scale-95"
          >
            <ChevronLeft className="size-7" strokeWidth={3} aria-hidden />
          </button>
          <span className="truncate font-display text-lg font-extrabold">Finalizar a compra</span>
        </div>
      </header>

    </>
  );
}

/**
 * Cabeçalho do carrinho — só no telemóvel: seta de recuo + título. No
 * computador a página não tem cabeçalho (navegação no rodapé).
 */
function CartHeader() {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-50 bg-gradient-to-r from-header to-header-strong text-white shadow-md shadow-header/20 md:hidden">
      <div className="container-nsm flex h-14 items-center gap-1.5">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Voltar"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/15 active:scale-95"
        >
          <ChevronLeft className="size-7" strokeWidth={3} aria-hidden />
        </button>
        <span className="truncate font-display text-lg font-extrabold">Carrinho de compras</span>
      </div>
    </header>
  );
}

/**
 * Cabeçalho dos pedidos — só no telemóvel, fixo: seta de recuo + título. No
 * computador a página não tem cabeçalho (navegação no rodapé).
 */
function PedidosHeader() {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-50 bg-gradient-to-r from-header to-header-strong text-white shadow-md shadow-header/20 md:hidden">
      <div className="container-nsm flex h-14 items-center gap-1.5">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Voltar"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/15 active:scale-95"
        >
          <ChevronLeft className="size-7" strokeWidth={3} aria-hidden />
        </button>
        <span className="truncate font-display text-lg font-extrabold">Meus pedidos</span>
      </div>
    </header>
  );
}

export function ConditionalHeader() {
  const pathname = usePathname();

  if (pathname === "/checkout" || pathname.startsWith("/checkout/")) {
    return <CheckoutHeader />;
  }

  if (pathname === "/carrinho" || pathname.startsWith("/carrinho/")) {
    return <CartHeader />;
  }

  if (pathname === "/pedidos" || pathname.startsWith("/pedidos/")) {
    return <PedidosHeader />;
  }

  const isSingleHeader = SINGLE_HEADER_ROUTES.some((route) =>
    pathname === route || pathname.startsWith(route + "/")
  );

  if (isSingleHeader) return null;

  // Abaixo de `md` o cabeçalho é sempre o `MobileStoreHeader` — não há duas
  // experiências mobile a coexistir (o `Header` de sempre é agora só o
  // cabeçalho do desktop, daí o `hidden md:block`). Acima de `md` tudo fica
  // exatamente como estava. O `Header` mantém a compactação ao rolar (`scrolled`,
  // que fora removida por regressão e já está novamente aplicável).
  return (
    <>
      <MobileStoreHeader />
      <Header className="hidden md:block" />
    </>
  );
}
