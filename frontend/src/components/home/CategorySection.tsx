"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import type { Category } from "@/lib/types";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useRequireAuth } from "@/components/auth/RequireAuth";

export function CategorySection({ categories }: { categories: Category[] }) {
  const { checkAuth } = useRequireAuth();
  
  const handleCategoryClick = (href: string, e: React.MouseEvent<HTMLAnchorElement>) => {
    const handled = checkAuth(() => {
      // Se autenticado, permite a navegação normal
    });
    if (!handled) {
      e.preventDefault();
    }
  };

  return (
    <section aria-labelledby="categorias" className="container-nsm">
      <SectionHeader
        title="Comprar por categoria"
        subtitle="Encontre tudo o que precisa, organizado por área"
        linkLabel="Ver todas"
        linkHref="/categorias"
      />
      <div className="no-scrollbar -mx-4 flex snap-x gap-3  overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={`/categoria/${c.slug}`}
            onClick={(e) => handleCategoryClick(`/categoria/${c.slug}`, e)}
            className="group relative aspect-[4/5] w-32 shrink-0 snap-start overflow-hidden rounded-2xl sm:w-auto sm:aspect-[4/3]"
          >
            <Image
              src={c.image}
              alt={c.name}
              fill
              sizes="(max-width: 640px) 128px, 20vw"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-navy-950/85 via-navy-950/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3">
              <span className="mb-1 block text-xl">{c.emoji}</span>
              <p className="font-display text-sm font-bold text-white">{c.name}</p>
              <p className="mt-0.5 flex items-center gap-0.5 text-[11px] font-medium text-white/70 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                Explorar <ChevronRight className="size-3" />
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
