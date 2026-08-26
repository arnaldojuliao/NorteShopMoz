import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NorteShop — Loja online em Moçambique",
    short_name: "NS",
    description:
      "Compras simples, seguras e acessíveis. Eletrónica, moda, casa e mais com entrega para todo Moçambique.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1f46e6",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    lang: "pt",
  };
}
