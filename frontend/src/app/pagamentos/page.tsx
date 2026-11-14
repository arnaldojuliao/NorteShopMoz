import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, CreditCard, Smartphone } from "lucide-react";
import { InfoPage } from "@/components/layout/InfoPage";
import { paymentMethods } from "@/lib/payments";

export const metadata: Metadata = {
  title: "Métodos de pagamento",
  description:
    "Métodos de pagamento aceites na NorteShopMoz: M-Pesa, e-Mola, mKesh e cartão Visa/Mastercard.",
};

/** Ícone de cada método (apresentação; os dados vêm de `@/lib/payments`). */
const icons: Record<string, typeof Banknote> = {
  mpesa: Smartphone,
  emola: Smartphone,
  mkesh: Smartphone,
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
      subtitle="Pague com carteira móvel ou cartão."
      updatedAt="Outubro de 2026"
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
              No checkout, escolha o método e clique em Comprar. A loja abre
              logo a página segura do provedor, onde conclui com o número da
              carteira (M-Pesa, e-Mola ou mKesh) ou o cartão — e o pedido fica
              pago em minutos.
            </p>
          ),
        },
        {
          title: "Perdeu o link de pagamento?",
          body: (
            <p>
              Sem problema: abra o pedido em{" "}
              <Link href="/pedidos" className={linkClass}>Meus pedidos</Link> e use
              o botão <strong>Pagar agora</strong> (ou “Gerar link de
              pagamento”). Também pode falar com o suporte — a mensagem já vai
              com o código, os artigos e o total.
            </p>
          ),
        },
        {
          title: "Segurança",
          body: (
            <p>
              Todos os pagamentos são processados pelo gateway de pagamentos da
              loja numa página segura, e a ligação ao site é sempre cifrada
              (HTTPS). Não guardamos os dados do seu cartão nem os códigos das
              carteiras móveis — quem os recolhe é a página de pagamento do
              provedor.
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
