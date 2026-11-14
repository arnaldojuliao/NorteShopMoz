import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";
import { serializeJsonLd } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Perguntas frequentes",
  description: "Respostas às perguntas mais comuns sobre a NorteShopMoz: entregas, pagamentos, devoluções e mais.",
};

const faqs = [
  {
    q: "Como faço uma encomenda?",
    a: "Procure o produto, adicione ao carrinho e finalize a compra no checkout. Ao comprar, recebe um link de pagamento para concluir com o método escolhido.",
  },
  {
    q: "Quanto demora a entrega?",
    a: "Maputo: 1–3 dias úteis. Restantes províncias: 2–10 dias úteis conforme a localização. O prazo exato é indicado no checkout.",
  },
  {
    q: "Que métodos de pagamento aceitam?",
    a: "Aceitamos M-Pesa, e-Mola, mKesh e cartão Visa/Mastercard, todos pagos online através de um link de pagamento seguro. No checkout escolhe apenas o método — os dados (número da carteira ou cartão) são pedidos na página de pagamento.",
  },
  {
    q: "Onde vejo o link de pagamento?",
    a: "Depois de clicar em Comprar, a loja mostra o ecrã “Aguarde o link de pagamento” com o resumo da compra. O link chega pela conversa com o fornecedor (WhatsApp) e também fica no email de confirmação e na página do pedido. Se o link expirar, a página do pedido gera um novo.",
  },
  {
    q: "E se o produto não for o que esperava?",
    a: "Tem até 7 dias após a receção para pedir a devolução: em “Meus pedidos”, use o botão “Solicitar devolução” no cartão do pedido. A loja responde com a aprovação e o reembolso volta pelo mesmo método de pagamento.",
  },
  {
    q: "Os produtos têm garantia?",
    a: "Sim, todos os produtos têm garantia mínima de 6 meses contra defeitos de fabrico.",
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
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqJsonLd) }}
      />
      <InfoPage
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
