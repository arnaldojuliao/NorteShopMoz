import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";
import { provinces } from "@/lib/data/provinces";
import { formatMZN } from "@/lib/format";

export const metadata: Metadata = {
  title: "Entregas",
  description: "Prazos e custos de entrega da NorteShop para todas as províncias de Moçambique.",
};

export default function EntregasPage() {
  return (
    <InfoPage
      crumb="Entregas"
      title="Entregas em todo Moçambique"
      subtitle="Levamos as suas compras até si, onde quer que esteja."
      updatedAt="Agosto de 2026"
      sections={[
        {
          title: "Prazos e taxas por província",
          body: (
            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-600">
                    <th className="px-4 py-3 font-semibold">Província</th>
                    <th className="px-4 py-3 font-semibold">Prazo estimado</th>
                    <th className="px-4 py-3 text-right font-semibold">Taxa</th>
                  </tr>
                </thead>
                <tbody>
                  {provinces.map((p, i) => (
                    <tr key={p.name} className={i % 2 ? "bg-slate-50/60" : ""}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{p.name}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {p.days[0]}–{p.days[1]} dias úteis
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{formatMZN(p.fee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
        {
          title: "Entrega grátis",
          body: (
            <p>
              Encomendas acima de <strong>5.000 MT</strong> têm entrega grátis. Produtos
              marcados com “Envio grátis” também estão isentos da taxa de entrega.
            </p>
          ),
        },
        {
          title: "Acompanhamento",
          body: (
            <p>
              Depois de confirmada, a sua encomenda pode ser acompanhada na área de cliente,
              com o estado atualizado em cada etapa: recebido, pagamento confirmado, em
              preparação, enviado, em trânsito e entregue.
            </p>
          ),
        },
      ]}
    />
  );
}
