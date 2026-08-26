import type { Metadata, Viewport } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BottomNav } from "@/components/layout/BottomNav";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import { Providers } from "@/app/providers";
import { site } from "@/config/site";
import "./globals.css";

// Usar fontes do sistema para evitar problemas de rede com Google Fonts
const fontSans = { variable: "--font-sans", className: "font-sans" };
const fontHeading = { variable: "--font-heading", className: "font-heading" };

const SITE_URL = site.url;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "NorteShop — Compras simples, seguras e acessíveis em Moçambique",
    template: "%s · NorteShop",
  },
  description:
    "NorteShop (NS) é a loja online moçambicana de eletrónica, moda, casa, beleza e muito mais. Entrega para todo Moçambique e pagamento na entrega.",
  keywords: [
    "loja online Moçambique",
    "e-commerce Moçambique",
    "NorteShop",
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
    siteName: "NorteShop",
    title: "NorteShop — Compras simples, seguras e acessíveis",
    description:
      "Eletrónica, moda, casa, beleza e muito mais com entrega para todo Moçambique.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "NorteShop — Loja online em Moçambique",
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
  name: "NorteShop",
  alternateName: "NSM",
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
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
  name: "NorteShop",
  url: SITE_URL,
  inLanguage: "pt-MZ",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/procurar?q={search_term_string}`,
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
    <html lang="pt" className={`${fontSans.variable} ${fontHeading.variable}`} suppressHydrationWarning>
      <head>
        {/* Meta tag placeholder para CSP nonce (preenchida client-side se necessário) */}
        <meta name="csp-nonce" content="" id="csp-nonce-meta" />
        
        {/* Aplica o tema antes da primeira pintura (evita flash claro/escuro). */}
        <script
          id="theme-script"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var r=localStorage.getItem("nsm:theme"),t=null;if(r){try{t=JSON.parse(r)}catch(e){t=r}}if(t!=="light"&&t!=="dark"&&t!=="system")t="system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`,
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <Providers>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
          />
          <a
            href="#conteudo"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
          >
            Saltar para o conteúdo
          </a>
          <Header />
          <main id="conteudo" className="flex-1">
            {children}
          </main>
          <Footer />
          <BottomNav />
          <InstallPrompt />
        </Providers>
      </body>
    </html>
  );
}