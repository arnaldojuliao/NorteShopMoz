import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";

export const metadata: Metadata = {
  title: "Termos e condições",
  description: "Termos e condições de utilização da loja online NorteShop.",
};

export default function TermosPage() {
  return (
    <InfoPage
      crumb="Termos e condições"
      title="Termos e condições"
      updatedAt="Agosto de 2026"
      sections={[
        {
          title: "1. Aceitação dos termos",
          body: (
            <p>
              Ao utilizar a NorteShop (NS), concorda com estes termos. Os preços são
              apresentados em Meticais (MT) e podem ser alterados sem aviso prévio, sendo o
              preço confirmado no momento do checkout.
            </p>
          ),
        },
        {
          title: "2. Encomendas e pagamento",
          body: (
            <p>
              Uma encomenda só é considerada confirmada após a sua validação. Os métodos de
              pagamento disponíveis são: pagamento na entrega, transferência bancária,
              M-Pesa, e-Mola e cartão Visa/Mastercard.
            </p>
          ),
        },
        {
          title: "3. Preços e disponibilidade",
          body: (
            <p>
              Trabalhamos com fornecedores parceiros; a disponibilidade de um produto pode
              mudar. Se um produto ficar indisponível após a sua encomenda, entraremos em
              contacto para oferecer alternativa ou reembolso total.
            </p>
          ),
        },
        {
          title: "4. Limitação de responsabilidade",
          body: (
            <p>
              A NSM atua como intermediária entre o cliente e os fornecedores. As fotografias
              e descrições são indicativas; em caso de divergência, prevalece a descrição
              oficial do produto.
            </p>
          ),
        },
      ]}
    />
  );
}
