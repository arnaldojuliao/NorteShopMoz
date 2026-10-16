import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, CreditCard, Landmark, Smartphone } from "lucide-react";
import { InfoPage } from "@/components/layout/InfoPage";
import { paymentMethods } from "@/lib/payments";

export const metadata: Metadata = {
  title: "Métodos de pagamento",
  description:
    "Todos os métodos de pagamento aceites na NorteShopMoz: pagamento na entrega, transferência bancária, M-Pesa, e-Mola e cartão Visa/Mastercard.",
};

/** Ícone de cada método (apresentação; os dados vêm de `@/lib/payments`). */
const icons: Record<string, typeof Banknote> = {
  cod: Banknote,
  transfer: Landmark,
  mpesa: Smartphone,
  emola: Smartphone,
  card: CreditCard,
};

const linkClass =
  "font-medium text-primary-700 underline-offset-4 hover:underline";

/**
 * Página com os métodos de pagamento da loja.
 *
 * A lista vem de `@/lib/payments` — a mesma fonte que o checkout usa — para
 * esta página nunca anunciar um método que a loja não aceite (nem esconder um
 * que existe). É o destino do botão da barra de confiança da homepage.
 */
export default function PagamentosPage() {
  return (
    <InfoPage
      title="Métodos de pagamento"
      subtitle="Pague como preferir: na entrega, por transferência bancária ou carteira móvel."
      updatedAt="Agosto de 2026"
      sections={[
        {
          title: "Métodos aceites",
          body: (
            <ul className="grid gap-3 sm:grid-cols-2">
              {paymentMethods.map((m) => {
                const Icon = icons[m.id] ?? Banknote;
                return (
                  <li
                    key={m.id}
                    className="rounded-2xl border border-slate-100 bg-surface p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700"
                        aria-hidden
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-display text-sm font-bold text-slate-900">
                          {m.name}
                          {m.paidOnline ? (
                            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">
                              Confirmação imediata
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {m.description}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ),
        },
        {
          title: "Como pagar no checkout",
          body: (
            <p>
              Escolha o método no passo de pagamento e confirme o pedido. No
              pagamento na entrega e na transferência bancária o pedido fica
              reservado à espera da confirmação; no cartão e nas carteiras
              móveis o pagamento é confirmado na hora, com a referência gerada
              pelo gateway da loja.
            </p>
          ),
        },
        {
          title: "Transferência bancária",
          body: (
            <p>
              Recebe os dados da conta e a referência do pedido logo após
              finalizar a compra (MBCI, Standard Bank, BCI, BIM, Absa, FNB ou
              Letshego). Assim que o pagamento é confirmado, a encomenda entra
              em preparação.
            </p>
          ),
        },
        {
          title: "Segurança",
          body: (
            <p>
              Os pagamentos com cartão e carteiras móveis são processados pelo
              gateway de pagamentos da loja e a ligação ao site é sempre
              cifrada (HTTPS). Não guardamos os dados do seu cartão nem os
              códigos das carteiras móveis.
            </p>
          ),
        },
        {
          title: "Precisa de ajuda?",
          body: (
            <p>
              Veja as{" "}
              <Link href="/ajuda" className={linkClass}>
                perguntas frequentes
              </Link>{" "}
              sobre pagamentos ou{" "}
              <Link href="/contactos" className={linkClass}>
                fale com o nosso suporte
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
