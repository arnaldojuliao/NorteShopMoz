import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Como a NorteShop recolhe, usa e protege os seus dados pessoais.",
};

export default function PrivacidadePage() {
  return (
    <InfoPage
      crumb="Política de privacidade"
      title="Política de privacidade"
      updatedAt="Agosto de 2026"
      sections={[
        {
          title: "1. Dados que recolhemos",
          body: (
            <p>
              Recolhemos apenas os dados necessários ao processamento das suas encomendas:
              nome, telefone, email, endereço de entrega e histórico de compras. Nunca
              recolhemos dados de pagamento por cartão nesta fase.
            </p>
          ),
        },
        {
          title: "2. Como usamos os seus dados",
          body: (
            <p>
              Os seus dados são usados para processar encomendas, organizar entregas, prestar
              suporte e, com a sua autorização, enviar comunicações de marketing. Não vendemos
              nem partilhamos os seus dados com terceiros.
            </p>
          ),
        },
        {
          title: "3. Cookies e armazenamento local",
          body: (
            <p>
              Utilizamos armazenamento local do navegador (localStorage) para guardar o seu
              carrinho, favoritos e preferências, permitindo uma experiência contínua. Pode
              limpar estes dados nas definições do seu navegador a qualquer momento.
            </p>
          ),
        },
        {
          title: "4. Os seus direitos",
          body: (
            <p>
              Pode solicitar o acesso, correção ou eliminação dos seus dados pessoais a
              qualquer momento através de{" "}
              <a href={`mailto:${site.privacyEmail}`} className="text-primary-700 underline underline-offset-2">
                {site.privacyEmail}
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
