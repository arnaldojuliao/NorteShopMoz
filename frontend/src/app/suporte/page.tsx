import type { Metadata } from "next";
import { Mail, MapPin, MessageCircle, Phone, LifeBuoy } from "lucide-react";
import { InfoPage } from "@/components/layout/InfoPage";
import { site, telHref, whatsappHref } from "@/config/site";
import { serializeJsonLd } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Suporte e Ajuda",
  description: `Central de suporte da ${site.name}: perguntas frequentes, contactos, chat e ajuda para as suas compras.`,
};

const contactItems = [
  {
    icon: Phone,
    title: "Telefone",
    value: site.phoneDisplay,
    href: telHref,
    color: "bg-emerald-50 text-emerald-700",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp",
    value: site.phoneDisplay,
    href: whatsappHref(),
    color: "bg-emerald-50 text-emerald-700",
  },
  {
    icon: Mail,
    title: "Email",
    value: site.email,
    href: `mailto:${site.email}`,
    color: "bg-primary-50 text-primary-700",
  },
  {
    icon: MapPin,
    title: "Morada",
    value: `${site.addressLine1}, ${site.addressCity}, ${site.addressCountry}`,
    color: "bg-accent/15 text-accent-strong",
  },
];

const faqs = [
  {
    q: "Como faço uma encomenda?",
    a: "Procure o produto, adicione ao carrinho e finalize a compra no checkout. Pode pagar por M-Pesa, e-Mola ou cartão bancário — a disponibilidade real dos métodos é mostrada no checkout.",
  },
  {
    q: "Quanto demora a entrega?",
    a: "Maputo: 1–3 dias úteis. Restantes províncias: 2–10 dias úteis conforme a localização. O prazo exato é indicado no checkout.",
  },
  {
    q: "Como pago a minha encomenda?",
    a: "Escolha o método no checkout e clique em Comprar. Abrimos a página segura do provedor, onde conclui o pagamento com M-Pesa, e-Mola, mKesh ou cartão.",
  },
  {
    q: "E se o produto não for o que esperava?",
    a: "Tem até 7 dias após a receção para pedir a devolução. Pode pedir a devolução diretamente na página das suas encomendas ou contactar o nosso suporte.",
  },
  {
    q: "Os produtos têm garantia?",
    a: "Sim, todos os produtos têm garantia mínima de 6 meses contra defeitos de fabrico.",
  },
  {
    q: "Aceitam M-Pesa ou e-Mola?",
    a: "Sim! Aceitamos M-Pesa, e-Mola e cartão bancário (Visa/Mastercard), processados pela PaySuite. Veja a página de Pagamentos para os detalhes.",
  },
];

const supportJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Suporte e Ajuda — NorteShopMoz",
  description: "Central de suporte: perguntas frequentes, contactos e ajuda para compras.",
  mainEntity: {
    "@type": "Organization",
    name: site.name,
    telephone: `+${site.phoneDigits}`,
    email: site.email,
  },
};

export default function SuportePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(supportJsonLd) }}
      />
      <InfoPage
        title="Suporte e Ajuda"
        subtitle="Estamos aqui para ajudar. Escolha como prefere falar connosco."
        sections={[
          {
            title: "Canais de atendimento",
            body: (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {contactItems.map((i) => (
                  <div
                    key={i.title}
                    className="group rounded-2xl border border-slate-100 bg-surface p-5 transition hover:border-primary-200 hover:shadow-md"
                  >
                    <span className={`flex size-12 items-center justify-center rounded-xl ${i.color}`}>
                      <i.icon className="size-6" />
                    </span>
                    <p className="mt-3 text-sm font-bold text-slate-900">{i.title}</p>
                    {i.href ? (
                      <a
                        href={i.href}
                        className="mt-0.5 inline-block text-sm text-primary-700 hover:underline group-hover:text-primary-600"
                      >
                        {i.value}
                      </a>
                    ) : (
                      <p className="mt-0.5 text-sm text-slate-600">{i.value}</p>
                    )}
                  </div>
                ))}
              </div>
            ),
          },
          {
            title: "Perguntas frequentes",
            body: (
              <div className="space-y-3">
                {faqs.map((f) => (
                  <details
                    key={f.q}
                    className="group rounded-xl border border-slate-100 bg-surface p-4 transition hover:border-primary-200"
                  >
                    <summary className="flex items-start gap-3 cursor-pointer list-none text-sm font-medium text-slate-900">
                      <LifeBuoy className="size-5 shrink-0 mt-0.5 text-primary-600" aria-hidden />
                      <span>{f.q}</span>
                    </summary>
                    <p className="mt-3 text-sm text-slate-600 leading-relaxed">{f.a}</p>
                  </details>
                ))}
              </div>
            ),
          },
          {
            title: "Horário de atendimento",
            body: (
              <p className="text-slate-600">
                Segunda a sexta, das 8h às 18h · Sábado, das 8h às 13h.
                <br />
                Respondemos em média em menos de 2 horas durante o horário de atendimento.
              </p>
            ),
          },
        ]}
      />
    </>
  );
}