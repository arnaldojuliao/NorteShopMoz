import type { NextConfig } from "next";
import { envOr } from "./src/lib/env";

// `envOr` porque um build arg ausente chega como string vazia (não undefined).
const API_BASE = envOr(process.env.NEXT_PUBLIC_API_BASE_URL, "http://localhost:8080");

// Destino do proxy same-origin (/api e /uploads) usado na Vercel.
// O domínio real fica numa env var do projeto — não no repositório — para que
// o browser continue a chamar apenas https://<loja>/api/... e os cookies
// HttpOnly (Domain=.dominio.com) sejam enviados sem problemas de SameSite.
const API_PROXY_TARGET = envOr(process.env.API_PROXY_TARGET, "").replace(/\/+$/, "");

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  { protocol: "https", hostname: "images.unsplash.com" },
  { protocol: "https", hostname: "picsum.photos" },
  // Imagens de produto enviadas para a Cloudinary.
  { protocol: "https", hostname: "res.cloudinary.com" },
];

// Imagens enviadas pelos administradores são servidas pelo backend. Com o proxy
// same-origin, a URL pública do browser é a da loja, mas o uploads devolve uma
// URL absoluta no domínio da API — ambos os hosts entram nos padrões para o
// next/image as poder otimizar.
for (const base of [API_BASE, API_PROXY_TARGET]) {
  try {
    const u = new URL(base);
    remotePatterns.push({
      protocol: u.protocol.replace(":", "") as "http" | "https",
      hostname: u.hostname,
      ...(u.port ? { port: u.port } : {}),
    });
  } catch {
    // URL vazia/inválida — mantém apenas os padrões fixos.
  }
}

const nextConfig: NextConfig = {
  // Standalone é usado pelo Docker. Na Vercel é ignorado — e no Next 16.3
  // combiná-lo com o adapter da Vercel rebenta o build com ENOENT em
  // `.next/next-server.js.nft.json` (regressão corrigida só em 16.4).
  output: process.env.VERCEL ? undefined : 'standalone',
  // Não anunciar o framework/framework version a quem faz pedidos.
  poweredByHeader: false,
  // /procurar foi unificado em /explore (mesmos parâmetros: q, deal, new,
  // bestseller). 308 preserva a query string e é cacheado como permanente —
  // os URLs antigos (sitemap, SearchAction) continuam a funcionar.
  async redirects() {
    return [{ source: '/procurar', destination: '/explore', permanent: true }];
  },
  // Na Vercel, API_PROXY_TARGET=https://api.<dominio> faz o proxy same-origin
  // para a API no Fly.io. Sem a variável (dev/local) não há rewrite: o browser
  // chama NEXT_PUBLIC_API_BASE_URL diretamente.
  async rewrites() {
    if (!API_PROXY_TARGET) return [];
    return [
      { source: '/api/:path*', destination: `${API_PROXY_TARGET}/api/:path*` },
      { source: '/uploads/:path*', destination: `${API_PROXY_TARGET}/uploads/:path*` },
    ];
  },
  images: {
    remotePatterns,
    formats: ["image/avif", "image/webp"],
    deviceSizes: [480, 640, 768, 1024, 1280, 1600],
  },
};

export default nextConfig;
