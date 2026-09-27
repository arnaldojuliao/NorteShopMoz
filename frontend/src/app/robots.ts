import type { MetadataRoute } from "next";
import { site } from "@/config/site";




export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          // Áreas privadas (conta, carrinho, checkout, administração): não têm
          // conteúdo indexável útil — gastam orçamento de rastreio e podem
          // expor dados de sessão em índices de terceiros.
          "/admin",
          "/carrinho",
          "/checkout",
          "/configuracoes",
          "/entrar",
          "/favoritos",
          "/pedido/",
          "/recuperar-password",
          "/verificar-email",
        ],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
