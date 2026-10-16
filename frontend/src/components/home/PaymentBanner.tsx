import { Banknote, CreditCard, Landmark, Lock, Smartphone } from "lucide-react";
import { highlightedPaymentMethods } from "@/lib/payments";

/** Ícone de cada método (apresentação; os dados vêm de `@/lib/payments`). */
const icons: Record<string, typeof Banknote> = {
  cod: Banknote,
  transfer: Landmark,
  mpesa: Smartphone,
  emola: Smartphone,
  card: CreditCard,
};

/**
 * Faixa de pagamento — anuncia apenas os métodos realmente implementados no
 * checkout (`highlightedPaymentMethods`), por isso não aparece aqui nenhum
 * serviço que a loja não aceite.
 *
 * No telemóvel fica escondida (`hidden sm:block`): o espaço é escasso e os
 * métodos continuam visíveis na loja toda (produto, carrinho e checkout).
 */
export function PaymentBanner() {
  return (
    <section
      aria-label="Compre agora, pague com segurança"
      className="container-nsm hidden sm:block"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-brand px-4 py-4 shadow-card sm:flex-row sm:justify-between sm:gap-6 sm:px-6">
        <p className="flex items-center gap-2.5 text-center font-display text-sm font-extrabold text-white sm:text-base">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white"
            aria-hidden
          >
            <Lock className="size-4" />
          </span>
          Compre agora, pague com segurança
        </p>

        <ul className="flex flex-wrap items-center justify-center gap-2">
          {highlightedPaymentMethods.map((m) => {
            const Icon = icons[m.id] ?? Banknote;
            return (
              <li
                key={m.id}
                className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white"
              >
                <Icon className="size-3.5 text-white/80" aria-hidden />
                {m.name}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
