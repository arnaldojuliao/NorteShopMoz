import type { PaymentMethod } from "@/lib/types";

/**
 * Métodos de pagamento aceites na NorteShopMoz — fonte única.
 *
 * Está aqui (e não dentro da página de checkout) porque a homepage também
 * mostra os métodos: assim a faixa de pagamento nunca anuncia um serviço que
 * o checkout não implementa, nem deixa de fora um que existe.
 *
 * Todos os pagos online (M-Pesa, e-Mola, mKesh, cartão) usam LINK de
 * pagamento (checkout hospedado): o checkout só pede a SELEÇÃO do método —
 * ao comprar, o cliente é encaminhado para a página do provedor (PaySuite
 * em produção; página simulada /pagamento-simulado em dev), que é quem
 * recolhe telefone/cartão e confirma por webhook.
 */
export const paymentMethods: PaymentMethod[] = [
  {
    id: "mpesa",
    name: "M-Pesa",
    description: "Carteira móvel — pagamento rápido pelo telemóvel.",
    available: true,
    paidOnline: true,
    needsPhone: true,
  },
  {
    id: "emola",
    name: "e-Mola",
    description: "Carteira móvel do Movitel.",
    available: true,
    paidOnline: true,
    needsPhone: true,
  },
  {
    id: "mkesh",
    name: "mKesh",
    description: "Carteira móvel do mKesh — pagamento pelo telemóvel.",
    available: true,
    paidOnline: true,
    needsPhone: true,
  },
  {
    id: "card",
    name: "Cartão Visa / Mastercard",
    description: "Pagamento com cartão internacional.",
    available: true,
    paidOnline: true,
    needsCard: true,
  },
];

/** Só os métodos realmente disponíveis — o que a loja aceita hoje. */
export const availablePaymentMethods = paymentMethods.filter((m) => m.available);

/** Métodos destacados na faixa da homepage (todos os aceites). */
export const highlightedPaymentMethods = availablePaymentMethods;

/**
 * Forma "de conta" de cada método (só nome/descrição/disponibilidade) — é o que a
 * área de cliente mostra na lista de pagamentos. Deriva de `paymentMethods` para
 * o painel nunca anunciar um método que o checkout não implementa.
 */
export const accountPaymentMethods: { name: string; description: string; available: boolean }[] =
  paymentMethods.map((m) => ({ name: m.name, description: m.description, available: m.available }));
