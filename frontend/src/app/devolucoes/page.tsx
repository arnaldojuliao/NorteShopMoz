import type { Metadata } from "next";
import { site } from "@/config/site";
import { InfoPage } from "@/components/layout/InfoPage";

export const metadata: Metadata = {
  title: "Política de devolução",
  description: "Saiba como devolver um produto comprado na NorteShopMoz.",
};

export default function DevolucoesPage() {
  return (
    <InfoPage
      title="Política de devolução"
      subtitle="Devolução simples, rápida e sem complicações."
      updatedAt="Agosto de 2026"
      sections={[
        {
          title: "Prazo de devolução",
          body: (
            <p>
              Tem até <strong>7 dias após a receção</strong> do produto para pedir a devolução,
              desde que o produto esteja na embalagem original e sem sinais de uso.
            </p>
          ),
        },
        {
          title: "Como devolver",
          body: (
            <>
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>
                  Em <strong>Meus pedidos</strong>, abra o cartão do pedido entregue e clique em{" "}
                  <strong>“Solicitar devolução”</strong>, indicando o motivo.
                </li>
                <li>A loja responde com a aprovação (ou a recusa, com o motivo).</li>
                <li>Receba as instruções de recolha ou envio.</li>
                <li>
                  Após a aprovação, o reembolso é processado pelo mesmo método de pagamento
                  (em pagamentos online) em até 5 dias úteis — o estado da devolução aparece no
                  próprio pedido.
                </li>
              </ol>
              <p className="mt-3 text-sm text-slate-500">
                Também pode falar connosco diretamente: WhatsApp {site.phoneDisplay} ou email{" "}
                {site.email}.
              </p>
            </>
          ),
        },
        {
          title: "Produtos defeituosos",
          body: (
            <p>
              Se o produto chegar danificado ou defeituoso, contacte-nos em até 48 horas após a
              receção. Substituímos o produto ou devolvemos o valor integral — sem custos para si.
            </p>
          ),
        },
        {
          title: "Exceções",
          body: (
            <p>
              Produtos de higiene pessoal e itens personalizados só podem ser devolvidos se
              estiverem selados e sem uso.
            </p>
          ),
        },
      ]}
    />
  );
}
