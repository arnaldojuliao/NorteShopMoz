import Image from "next/image";
import Link from "next/link";
import { navCategories } from "@/lib/nav-categories";

/**
 * Carril visual de categorias da homepage — círculos (estilo «stories»):
 * foto redonda da categoria com o nome por baixo.
 *
 * Usa a MESMA taxonomia do `/categorias` (`navCategories`) — os 17 destinos
 * (3 vistas + 14 departamentos reais) — para a navegação ser editada num sítio
 * só. Scroll horizontal, sem barra visível.
 *
 * O `id="categorias-home"` é o gatilho da faixa do cabeçalho: o `CategoryStrip`
 * fica oculto no topo da home e só entra quando esta secção é ultrapassada
 * pelo scroll (ver componente).
 */
export function CategoryTiles() {
  return (
    <section id="categorias-home" aria-label="Categorias" className="container-nsm scroll-mt-24">
      <ul className="no-scrollbar flex gap-3 overflow-x-auto pb-1 sm:gap-4">
        {navCategories.map((cat) => (
          <li key={cat.slug} className="shrink-0">
            <Link
              href={cat.primaryHref}
              className="group flex w-[4.5rem] flex-col items-center gap-1.5 sm:w-24"
              title={cat.name}
            >
              <span className="relative block size-[4.5rem] overflow-hidden rounded-full border border-slate-200/70 bg-surface shadow-card transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-card-hover sm:size-24">
                <Image
                  src={cat.image}
                  alt=""
                  fill
                  sizes="96px"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </span>
              <span className="w-full truncate text-center text-[11px] font-semibold text-slate-700 transition-colors group-hover:text-primary-700 sm:text-xs">
                {cat.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
