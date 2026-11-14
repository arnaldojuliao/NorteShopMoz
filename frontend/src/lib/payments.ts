import type { PaymentMethod } from "@/lib/types";

/**
 * Métodos de pagamento aceites na NorteShopMoz — fonte única.
 *
 * Está aqui (e não dentro da página de checkout) porque a homepage também
 * mostra os métodos: assim a faixa de pagamento nunca anuncia um serviço que
 * o checkout não implementa, nem deixa de fora um que existe.
 *
 * Todos os métodos usam LINK de pagamento (checkout hospedado): o checkout só
 * pede a SELEÇÃO do método — ao comprar, o cliente é encaminhado para a página
 * do provedor (PaySuite), que é quem recolhe telefone/cartão e confirma por
 * webhook. Quando o gateway não devolve link, o admin cola-o no pedido e o
 * cliente é avisado.
 *
 * Não reintroduzir métodos OFFLINE (pagamento na entrega, transferência): foram
 * removidos a pedido e o backend rejeita esses rótulos com 400.
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

/**
 * O link é a página de pagamento do PROVEDOR (ex.:
 * `https://paysuite.tech/checkout/01m59hkmj6v7ejvmkzvwqce7z5`) — e não uma
 * página da própria loja?
 *
 * Só estes links abrem sozinhos depois dos 3 s de processamento e só estes são
 * apresentados como «Pagar agora»: o que o cliente paga tem de vir do provedor
 * (ou ser o link que o admin colou no pedido), nunca uma página da própria
 * loja — essa não é a página do provedor e não recolhe pagamento nenhum.
 */
export function isProviderPaymentLink(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    // Sem `window` (SSR/testes) valida-se só o protocolo.
    const base = typeof window === "undefined" ? undefined : window.location.origin;
    parsed = new URL(url, base);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (typeof window === "undefined") return true;
  return parsed.host !== window.location.host;
}

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
