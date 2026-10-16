"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { compactCategories } from "@/lib/compact-categories";
import { cn } from "@/lib/utils";

/**
 * Faixa de categorias do cabeçalho.
 *
 * Vive num componente próprio para o cabeçalho mobile das páginas de loja
 * (`MobileStoreHeader`) poder reutilizar **exatamente** a mesma navegação — a
 * mesma lista (`compactCategories`), os mesmos `href` e as mesmas classes — sem
 * duplicar markup. O `Header` (desktop e restantes páginas) usa este mesmo
 * componente, pelo que a lista de categorias continua a ser editada num sítio só.
 *
 * `hiddenOn`: rotas em que a faixa não faz sentido porque a própria página
 * traz a navegação de categorias (ex.: `/categorias`, que tem o seu carril
 * fixo). Sem duplicar a mesma navegação duas vezes no mesmo ecrã.
 *
 * **Home**: no topo da página a faixa fica OCULTA — a navegação por categorias
 * é feita pelo carril visual de tiles (`#categorias-home`, que aparece mais
 * abaixo). Ao fazer scroll e ULTRAPASSAR essa secção, a faixa entra com uma
 * animação de altura (max-h 0 → auto), devolvendo o acesso rápido às
 * categorias a partir daí. Noutras rotas está sempre visível.
 */
export function CategoryStrip({ hiddenOn }: { hiddenOn?: string[] }) {
  const pathname = usePathname();
  const [pastTiles, setPastTiles] = useState(false);
  const isHome = pathname === "/";

  useEffect(() => {
    if (!isHome) return;
    const tiles = document.getElementById("categorias-home");
    if (!tiles) return;
    const check = () => setPastTiles(tiles.getBoundingClientRect().bottom < 0);
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [isHome]);

  if (
    hiddenOn?.some((route) => pathname === route || pathname.startsWith(route + "/"))
  ) {
    return null;
  }

  const hidden = isHome && !pastTiles;

  return (
    <nav
      aria-label="Categorias"
      className={cn("border-t border-white/20", hidden && "border-transparent")}
    >
      {/* Recolha animada: max-height + visibilidade — sem salto brusco na altura
          do cabeçalho e com os links inacessíveis quando oculto. */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-out",
          hidden ? "invisible max-h-0 opacity-0" : "visible max-h-14 opacity-100",
        )}
      >
        <div className="container-nsm">
          <ul className="flex gap-1 overflow-x-auto px-2 py-1.5 no-scrollbar">
            {compactCategories.map((cat) => (
              <li key={cat.id}>
                <Link
                  href={cat.href}
                  className="flex items-center px-2.5 py-1.5 text-[13px] font-medium text-white/90 transition hover:bg-white/15 hover:text-white whitespace-nowrap rounded-lg sm:px-3 sm:text-sm"
                >
                  {cat.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}
