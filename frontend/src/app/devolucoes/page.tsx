import type { Metadata } from "next";
import { site } from "@/config/site";
import { InfoPage } from "@/components/layout/InfoPage";

export const metadata: Metadata = {
  title: "Política de devolução",
  description: "Saiba como devolver um produto comprado na NorteShop.",
};

export default function DevolucoesPage() {
  return (
    <InfoPage
      crumb="Política de devolução"
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
                <li>Contacte o suporte (WhatsApp {site.phoneDisplay} ou email {site.email}).</li>
                <li>Indique o número do pedido e o motivo da devolução.</li>
                <li>Receba as instruções de recolha ou envio.</li>
                <li>Após a verificação, o reembolso é processado em até 5 dias úteis.</li>
              </ol>
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
