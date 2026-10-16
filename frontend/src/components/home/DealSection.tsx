import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CountdownTimer } from "@/components/home/CountdownTimer";
import { DealsRail } from "@/components/home/DealsRail";
import type { Product } from "@/lib/types";

/**
 * Bloco promocional da homepage (ofertas relâmpago).
 *
 * Cabeçalho compacto — emblema, título, subtítulo e "Ver todas" à direita —
 * seguido do contador (quando a promoção é do dia) e da faixa de produtos
 * (`DealsRail`): horizontal e com deslize automático para a esquerda no
 * telemóvel/tablet, grelha de 5 colunas no computador.
 *
 * Os cartões são o `ProductCard` da loja em `dealLayout`: imagem a sangrar
 * (maior), selo OFERTA, preço + antigo, número de vendas, estrelas e o botão de
 * compra ajustado ao canto da imagem — altura reduzida cerca de 100px no
 * telemóvel (sem percentuais, a pedido).
 */
export function DealSection({
  id,
  emoji,
  title,
  subtitle,
  linkHref,
  linkLabel = "Ver todas",
  products,
  countdown,
  eager,
}: {
  id: string;
  emoji: string;
  title: string;
  subtitle?: string;
  linkHref: string;
  linkLabel?: string;
  products: Product[];
  /** Mostra o contador até ao fim do dia (promoções por tempo limitado). */
  countdown?: boolean;
  eager?: boolean;
}) {
  return (
    <section aria-labelledby={id} className="container-nsm">
      <div className="mb-3 flex items-end justify-between gap-3 sm:mb-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            // `bg-red-50 text-red-600` são remapeados no tema escuro
            // (superfície suave + texto claro), como no resto da loja.
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-base text-red-600 sm:size-9 sm:text-lg"
            aria-hidden
          >
            {emoji}
          </span>
          <div className="min-w-0">
            <h2
              id={id}
              className="font-display text-base font-extrabold uppercase tracking-tight text-slate-900 sm:text-lg"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="truncate text-xs text-slate-500 sm:text-xs">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <Link
          href={linkHref}
          aria-label={`${linkLabel}: ${title}`}
          className="group -my-1 inline-flex shrink-0 items-center gap-1.5 py-1 text-xs font-semibold text-primary-700 transition hover:text-primary-800 sm:text-sm"
        >
          {linkLabel}
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>

      {/* Contador escondido no telemóvel (`hidden sm:block`): é informação
          secundária e roubava altura aos produtos. */}
      {countdown && products.length > 0 && (
        <div className="mb-3 hidden sm:mb-4 sm:block">
          <CountdownTimer onDark={false} />
        </div>
      )}

      {products.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
          Sem produtos nesta seleção de momento.
        </p>
      ) : (
        <DealsRail products={products} eager={eager} />
      )}
    </section>
  );
}
