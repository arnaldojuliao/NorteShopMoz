import type { Category } from "@/lib/types";

/**
 * Categorias da NorteShop.
 * `image` usa fotos reais (Unsplash CDN) — trocável pela API quando o
 * backend Spring Boot estiver disponível.
 */
export const categories: Category[] = [
  {
    slug: "eletronicos",
    name: "Eletrónicos",
    emoji: "📺",
    image:
      "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=800&q=70",
    description: "TV, áudio, áudio portátil e muito mais.",
  },
  {
    slug: "telemoveis",
    name: "Telemóveis",
    emoji: "📱",
    image:
      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=70",
    description: "Smartphones e acessórios móveis.",
  },
  {
    slug: "informatica",
    name: "Informática",
    emoji: "💻",
    image:
      "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=800&q=70",
    description: "Portáteis, periféricos e redes.",
  },
  {
    slug: "casa",
    name: "Casa",
    emoji: "🏠",
    image:
      "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=70",
    description: "Mobiliário, cozinha e eletrodomésticos.",
  },
  {
    slug: "moda",
    name: "Moda",
    emoji: "👕",
    image:
      "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=70",
    description: "Roupa, calçado e estilo.",
  },
  {
    slug: "beleza",
    name: "Beleza",
    emoji: "💄",
    image:
      "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=800&q=70",
    description: "Perfumes, cuidados e cosméticos.",
  },
  {
    slug: "acessorios",
    name: "Acessórios",
    emoji: "⌚",
    image:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=70",
    description: "Relógios, óculos, malas e gadgets.",
  },
  {
    slug: "desporto",
    name: "Desporto",
    emoji: "⚽",
    image:
      "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=800&q=70",
    description: "Fitness, treino e equipamento.",
  },
  {
    slug: "automovel",
    name: "Automóvel",
    emoji: "🚗",
    image:
      "https://images.unsplash.com/photo-1489824904134-891ab64532f1?auto=format&fit=crop&w=800&q=70",
    description: "Acessórios e tecnologia para o carro.",
  },
  {
    slug: "outros",
    name: "Outros",
    emoji: "🎁",
    image:
      "https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=800&q=70",
    description: "Brinquedos, bebé, pets e presentes.",
  },
];

export function getCategory(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}

/** Emoji associado à categoria (usado em fallbacks visuais). */
export function categoryEmoji(slug: string): string {
  return categories.find((c) => c.slug === slug)?.emoji ?? "🛍️";
}
