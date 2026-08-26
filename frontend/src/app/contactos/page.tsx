import type { Metadata } from "next";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { InfoPage } from "@/components/layout/InfoPage";
import { site, telHref, whatsappHref } from "@/config/site";

export const metadata: Metadata = {
  title: "Contactos",
  description: `Fale com o suporte da ${site.name}: telefone, email, WhatsApp e morada em ${site.addressCity}.`,
};

const items = [
  {
    icon: Phone,
    title: "Telefone",
    value: site.phoneDisplay,
    href: telHref,
  },
  {
    icon: MessageCircle,
    title: "WhatsApp",
    value: site.phoneDisplay,
    href: whatsappHref(),
  },
  {
    icon: Mail,
    title: "Email",
    value: site.email,
    href: `mailto:${site.email}`,
  },
  {
    icon: MapPin,
    title: "Morada",
    value: `${site.addressLine1}, ${site.addressCity}, ${site.addressCountry}`,
  },
];

const contactJsonLd = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: `Contactos — ${site.name}`,
  url: `${site.url}/contactos`,
  mainEntity: {
    "@type": "Organization",
    name: site.name,
    telephone: `+${site.phoneDigits}`,
    email: site.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: site.addressLine1,
      addressLocality: site.addressCity,
      addressCountry: "MZ",
    },
  },
};

export default function ContactosPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactJsonLd) }}
      />
      <InfoPage
      crumb="Contactos"
      title="Fale connosco"
      subtitle="Estamos aqui para ajudar. Escolha o canal que preferir."
      sections={[
        {
          body: (
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((i) => (
                <div key={i.title} className="rounded-2xl border border-slate-100 bg-white p-5">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                    <i.icon className="size-5" />
                  </span>
                  <p className="mt-3 text-sm font-bold text-slate-900">{i.title}</p>
                  {i.href ? (
                    <a
                      href={i.href}
                      className="mt-0.5 inline-block text-sm text-primary-700 hover:underline"
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
          title: "Horário de atendimento",
          body: (
            <p>
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
