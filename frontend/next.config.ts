import type { NextConfig } from "next";
import { envOr } from "./src/lib/env";

// `envOr` porque um build arg ausente chega como string vazia (não undefined).
const API_BASE = envOr(process.env.NEXT_PUBLIC_API_BASE_URL, "http://localhost:8081");

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  { protocol: "https", hostname: "images.unsplash.com" },
  { protocol: "https", hostname: "picsum.photos" },
  // Imagens de produto enviadas para a Cloudinary.
  { protocol: "https", hostname: "res.cloudinary.com" },
];

// Imagens enviadas pelos administradores são servidas pelo backend (API base) —
// adiciona o host da API aos padrões para o next/image as poder otimizar.
try {
  const u = new URL(API_BASE);
  remotePatterns.push({
    protocol: u.protocol.replace(":", "") as "http" | "https",
    hostname: u.hostname,
    ...(u.port ? { port: u.port } : {}),
  });
} catch {
  // URL inválida — mantém apenas os padrões fixos.
}

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: 'standalone',
  // Não anunciar o framework/framework version a quem faz pedidos.
  poweredByHeader: false,
  // /procurar foi unificado em /explore (mesmos parâmetros: q, deal, new,
  // bestseller). 308 preserva a query string e é cacheado como permanente —
  // os URLs antigos (sitemap, SearchAction) continuam a funcionar.
  async redirects() {
    return [{ source: '/procurar', destination: '/explore', permanent: true }];
  },
  images: {
    remotePatterns,
    formats: ["image/avif", "image/webp"],
    deviceSizes: [480, 640, 768, 1024, 1280, 1600],
  },
};

export default nextConfig;
