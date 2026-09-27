import type { Metadata, Viewport } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BottomNav } from "@/components/layout/BottomNav";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import { DeliveryLoader } from "@/components/ui/DeliveryLoader";
import { ApiDegradedBanner } from "@/components/ApiDegradedBanner";
import { Providers } from "@/app/providers";
import { site } from "@/config/site";
import { serializeJsonLd } from "@/lib/utils";
import "./globals.css";

// Usar fontes do sistema para evitar problemas de rede com Google Fonts
const fontSans = { variable: "--font-sans", className: "font-sans" };
const fontHeading = { variable: "--font-heading", className: "font-heading" };

const SITE_URL = site.url;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "NorteShopMoz — Compras simples, seguras e acessíveis em Moçambique",
    template: "%s · NorteShopMoz",
  },
  description:
    "NorteShopMoz (NS) é a loja online moçambicana de eletrónica, moda, casa, beleza e muito mais. Entrega para todo Moçambique e pagamento na entrega.",
  keywords: [
    "loja online Moçambique",
    "e-commerce Moçambique",
    "NorteShopMoz",
    "comprar online Moçambique",
    "dropshipping Moçambique",
    "eletrónica",
    "moda",
    "casa",
    "beleza",
  ],
  openGraph: {
    type: "website",
    locale: "pt_MZ",
    siteName: "NorteShopMoz",
    title: "NorteShopMoz — Compras simples, seguras e acessíveis",
    description:
      "Eletrónica, moda, casa, beleza e muito mais com entrega para todo Moçambique.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "NorteShopMoz — Loja online em Moçambique",
    description: "Compras simples, seguras e acessíveis em todo Moçambique.",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: SITE_URL,
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "NorteShopMoz",
  alternateName: "NSM",
  url: SITE_URL,
  // Versão de 512px (o master de 1254px/1,3 MB não deve ser o que um motor de
  // busca descarrega para validar a marca).
  logo: `${SITE_URL}/logo-512.png`,
  description:
    "Loja online moçambicana de eletrónica, moda, casa, beleza e muito mais, com entrega para todo Moçambique.",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Maputo",
    addressCountry: "MZ",
  },
  contactPoint: {
    "@type": "ContactPoint",
    telephone: `+${site.phoneDigits}`,
    contactType: "customer service",
    availableLanguage: ["pt", "en"],
  },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "NorteShopMoz",
  url: SITE_URL,
  inLanguage: "pt-MZ",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/explore?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
  publisher: { "@id": `${SITE_URL}/#organization` },
};

export const viewport: Viewport = {
  themeColor: "#1f46e6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt" className={`${fontSans.variable} ${fontHeading.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/*
         * Aplica o tema antes da primeira pintura (evita flash claro/escuro).
         * Fica em /public (e não inline) para a CSP dispensar 'unsafe-inline':
         * os scripts da própria origem são cobertos por script-src 'self'.
         */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" />
        {/*
         * Liga o preloader de entrada antes da primeira pintura. Desligar o
         * preloader = trocar `enabled` no componente abaixo (ou apagar este
         * script, que também deixa o overlay escondido).
         */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/preloader-init.js" />
      </head>
      <body className="flex min-h-screen flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <Providers>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationJsonLd) }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd) }}
          />
          <a
            href="#conteudo"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
          >
            Saltar para o conteúdo
          </a>
          <Header />
          {/* Modo degradado: a API caiu — avisa em vez de servir dados locais em silêncio. */}
          <ApiDegradedBanner />
          <main id="conteudo" className="flex-1">
            {children}
          </main>
          <Footer />
          <BottomNav />
          <InstallPrompt />
          <DeliveryLoader />
        </Providers>
      </body>
    </html>
  );
}