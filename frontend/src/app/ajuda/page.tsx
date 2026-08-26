import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";

export const metadata: Metadata = {
  title: "Perguntas frequentes",
  description: "Respostas às perguntas mais comuns sobre a NorteShop: entregas, pagamentos, devoluções e mais.",
};

const faqs = [
  {
    q: "Como faço uma encomenda?",
    a: "Procure o produto, adicione ao carrinho e finalize a compra no checkout. Pode pagar na entrega ou por transferência bancária.",
  },
  {
    q: "Quanto demora a entrega?",
    a: "Maputo: 1–3 dias úteis. Restantes províncias: 2–10 dias úteis conforme a localização. O prazo exato é indicado no checkout.",
  },
  {
    q: "Posso pagar na entrega?",
    a: "Sim! O pagamento na entrega (dinheiro) está disponível em todo Moçambique. Também aceitamos transferência bancária.",
  },
  {
    q: "E se o produto não for o que esperava?",
    a: "Tem até 7 dias após a receção para pedir a devolução. Contacte o nosso suporte e tratamos de tudo.",
  },
  {
    q: "Os produtos têm garantia?",
    a: "Sim, todos os produtos têm garantia mínima de 6 meses contra defeitos de fabrico.",
  },
  {
    q: "Aceitam M-Pesa ou e-Mola?",
    a: "Estamos a preparar a integração com as carteiras móveis M-Pesa e e-Mola. Enquanto isso, use pagamento na entrega ou transferência.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function AjudaPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <InfoPage
      crumb="Ajuda"
      title="Perguntas frequentes"
      subtitle="Tudo o que precisa de saber para comprar com confiança."
      updatedAt="Agosto de 2026"
      sections={faqs.map((f) => ({
        title: f.q,
        body: <p>{f.a}</p>,
      }))}
      />
    </>
  );
}
