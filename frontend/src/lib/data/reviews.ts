import type { Product, Review } from "@/lib/types";

/** Avaliações determinísticas geradas a partir do slug do produto. */
const authors = ["Carlos M.", "Anabela T.", "José N.", "Marta C.", "Rui S.", "Fátima A.", "Edson B.", "Lúcia P."];
const titles = ["Excelente qualidade!", "Muito satisfeito(a)", "Recomendo", "Bom produto", "Superou as expectativas", "Valeu a pena"];
const comments = [
  "Chegou rápido em Maputo e veio bem embalado. A qualidade é muito boa pelo preço.",
  "Comprei para oferecer e adorei. O atendimento da loja também foi excelente.",
  "Funciona perfeitamente. Recomendo a NorteShop para quem quer comprar com confiança.",
  "Bom produto, entrega dentro do prazo combinado em Nampula.",
  "Estou a usar há duas semanas e estou muito contente com a compra.",
  "O preço é imbatível comparado com as lojas locais. Voltarei a comprar.",
];

/** Hash determinístico simples a partir de string. */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function getReviewsFor(product: Product): Review[] {
  const seed = hashStr(product.slug);
  const count = 3 + (seed % 2); // 3–4 avaliações
  return Array.from({ length: count }, (_, i) => {
    const h = (seed + i * 7919) >>> 0;
    return {
      id: `r-${product.id}-${i}`,
      author: authors[h % authors.length],
      rating: 4 + (h % 2) === 5 ? 5 : 4 + (h % 2),
      date: new Date(Date.now() - (h % 90) * 86400000).toISOString(),
      title: titles[h % titles.length],
      comment: comments[h % comments.length],
      verified: h % 3 !== 0,
    };
  });
}

/** Perguntas frequentes determinísticas por produto. */
export function getFaqsFor(product: Product): { q: string; a: string }[] {
  return [
    {
      q: "Quanto tempo demora a entrega?",
      a: `A entrega para Maputo leva entre ${product.deliveryDays[0]} e ${product.deliveryDays[1]} dias úteis. Para as restantes províncias, consulte a tabela de prazos no checkout.`,
    },
    {
      q: "Posso pagar na entrega?",
      a: "Sim! Aceitamos pagamento na entrega (dinheiro) em todo Moçambique, além de transferência bancária.",
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
