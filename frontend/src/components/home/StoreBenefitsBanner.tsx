"use client";

import { AnimatedPromotion } from "@/components/home/AnimatedPromotion";
import { promotionMessages, type PromotionMessage } from "@/lib/store-benefits";

interface StoreBenefitsBannerProps {
  promotionMessages?: PromotionMessage[];
  animationIntervalMs?: number;
}

/**
 * Faixa de vantagens da loja.
 *
 * Tinha **dois** painéis: um cartão fixo («Entrega grátis / Oferta por tempo
 * limitado») e, ao lado, uma mensagem rotativa cujo primeiro item era
 * exatamente o mesmo texto — a mesma frase duas vezes no mesmo bloco, ~120px de
 * ecrã no telemóvel. Ficou só a rotação, que já começa por «Entrega grátis»:
 * uma única fonte de verdade, sem repetição, e cerca de metade da altura.
 */
export function StoreBenefitsBanner({
  promotionMessages: promotionMessagesProp = promotionMessages,
  animationIntervalMs = 3500,
}: StoreBenefitsBannerProps) {
  return (
    <section aria-labelledby="store-benefits" className="w-full pt-3 sm:pt-4">
      {/* O rótulo do landmark apontava para um id inexistente. */}
      <h2 id="store-benefits" className="sr-only">
        Vantagens da loja
      </h2>
      <div className="container-nsm">
        <div className="relative overflow-hidden rounded-2xl border border-primary-100 bg-primary-50">
          <AnimatedPromotion
            messages={promotionMessagesProp}
            intervalMs={animationIntervalMs}
            className="px-3 py-2 lg:px-4 lg:py-3"
          />
        </div>
      </div>
    </section>
  );
}
