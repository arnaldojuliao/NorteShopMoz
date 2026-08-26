import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";
import { CountdownTimer } from "@/components/home/CountdownTimer";
import { ProductCard } from "@/components/product/ProductCard";
import type { Product } from "@/lib/types";

export function DailyDeals({ deals }: { deals: Product[] }) {
  return (
    <section aria-labelledby="ofertas-hoje" className="container-nsm">
      {/* Título centralizado + contador + seta para a página de ofertas */}
      <div className="mb-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-red-600">
          <Flame className="size-3.5" aria-hidden /> Ofertas
        </span>
        <h2
          id="ofertas-hoje"
          className="mt-2 font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl"
        >
          Ofertas de hoje
        </h2>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <CountdownTimer onDark={false} />
          <Link
            href="/procurar?deal=1"
            aria-label="Ver todas as ofertas"
            className="group flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:border-primary-300 hover:text-primary-700 hover:shadow-card-hover active:scale-95"
          >
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>

      {/* Produtos em linha horizontal com scroll — cards padrão do site sem
          preço, carrinho e envio */}
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {deals.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            className="w-44 shrink-0 snap-start sm:w-52"
            hidePrice
            hideCart
            hideShipping
          />
        ))}
      </div>
    </section>
  );
}
