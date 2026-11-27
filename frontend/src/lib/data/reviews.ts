import type { Product } from "@/lib/types";

/** Perguntas frequentes determinísticas por produto. */
export function getFaqsFor(product: Product): { q: string; a: string }[] {
  return [
    {
      q: "Quanto tempo demora a entrega?",
      a: `A entrega para Maputo leva entre ${product.deliveryDays[0]} e ${product.deliveryDays[1]} dias úteis. Para as restantes províncias, consulte a tabela de prazos no checkout.`,
    },
    {
      q: "Como posso pagar?",
      a: "Pode pagar com M-Pesa, e-Mola, mKesh ou cartão Visa/Mastercard na página segura do provedor, logo após finalizar a compra.",
    },
    {
      q: "O produto tem garantia?",
      a: "Sim, todos os produtos têm garantia mínima de 6 meses contra defeitos de fabrico.",
    },
    {
      q: "E se quiser devolver?",
      a: "A devolução é simples: contacte o nosso suporte em até 7 dias após a receção e tratamos de tudo.",
    },
  ];
}
