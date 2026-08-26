import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";

export const metadata: Metadata = {
  title: "Sobre nós",
  description:
    "Conheça a NorteShop (NS): a loja online moçambicana de compras simples, seguras e acessíveis.",
};

export default function SobrePage() {
  return (
    <InfoPage
      crumb="Sobre nós"
      title="Sobre a NorteShop"
      subtitle="Compras simples, seguras e acessíveis para todo Moçambique."
      updatedAt="Agosto de 2026"
      sections={[
        {
          title: "Quem somos",
          body: (
            <>
              <p>
                A <strong>NorteShop (NS)</strong> nasceu com uma missão clara: levar o
                melhor do comércio online a todos os moçambicanos, da capital Maputo até às
                províncias mais distantes como Niassa e Cabo Delgado.
              </p>
              <p className="mt-3">
                Somos uma loja online moderna que reúne eletrónica, telemóveis, moda, casa,
                beleza, desporto e muito mais — com preços justos, pagamento na entrega e
                suporte em português.
              </p>
            </>
          ),
        },
        {
          title: "A nossa promessa",
          body: (
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Entrega para todas as províncias de Moçambique.</li>
              <li>Pagamento na entrega ou por transferência bancária.</li>
              <li>Produtos com garantia mínima de 6 meses.</li>
              <li>Devolução simples em até 7 dias após a receção.</li>
              <li>Suporte ao cliente em português, de segunda a sábado.</li>
            </ul>
          ),
        },
      ]}
    />
  );
}
