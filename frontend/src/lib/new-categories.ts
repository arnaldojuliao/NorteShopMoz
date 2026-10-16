import type { Category } from "@/lib/types";

/**
 * Taxonomia de navegação da loja — **espelho do catálogo do backend**.
 *
 * A lista vem de `GET /api/categories` (as 14 categorias reais) mais as três
 * entradas especiais, que não são categorias do catálogo e por isso não têm
 * página própria (`todos` → `/categorias`, `novidades` → `/explore?new=1`,
 * `ofertas` → `/explore?deal=1`).
 *
 * Manter os slugs iguais aos do backend não é cosmético: a página
 * `/categoria/<slug>` procura a categoria no repositório e devolve 404 quando
 * não a encontra. A taxonomia anterior (17 slugs como `moda-feminina` ou
 * `casa-decoracao`) não existia no catálogo — 13 dos 14 links do menu abriam
 * uma página de erro. Ao adicionar categorias no backend, acrescentar aqui a
 * mesma slug (e o mesmo nome).
 */
export const newCategories: Category[] = [
  {
    slug: "todos",
    name: "Todos",
    emoji: "📦",
    image: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=800&q=70",
    description: "Todas as categorias disponíveis",
  },
  {
    slug: "novidades",
    name: "Novidades",
    emoji: "✨",
    image: "https://images.unsplash.com/photo-1607083206968-13611e3d76db?auto=format&fit=crop&w=800&q=70",
    description: "Produtos que acabaram de chegar",
  },
  {
    slug: "ofertas",
    name: "Ofertas",
    emoji: "🔥",
    image: "https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=800&q=70",
    description: "Descontos imperdíveis por tempo limitado",
  },
  {
    slug: "mulheres",
    name: "Mulheres",
    emoji: "👗",
    image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=70",
    description: "Roupa, calçado e acessórios para ela.",
  },
  {
    slug: "homens",
    name: "Homens",
    emoji: "👔",
    image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=800&q=70",
    description: "Roupa, calçado e acessórios para ele.",
  },
  {
    slug: "casa",
    name: "Casa",
    emoji: "🏠",
    image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=70",
    description: "Decoração, têxtil-lar e eletrodomésticos.",
  },
  {
    slug: "calcados",
    name: "Calçados",
    emoji: "👟",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=70",
    description: "Ténis, sandálias, sociais e chinelos.",
  },
  {
    slug: "eletronicos",
    name: "Eletrónicos",
    emoji: "📺",
    image: "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=800&q=70",
    description: "TV, áudio, áudio portátil e muito mais.",
  },
  {
    slug: "telemoveis",
    name: "Telemóveis",
    emoji: "📱",
    image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=70",
    description: "Smartphones e acessórios móveis.",
  },
  {
    slug: "joias",
    name: "Joias",
    emoji: "💍",
    image: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=800&q=70",
    description: "Colares, pulseiras, anéis e brincos.",
  },
  {
    slug: "desporto",
    name: "Desporto",
    emoji: "⚽",
    image: "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=800&q=70",
    description: "Roupa e equipamento desportivo.",
  },
  {
    slug: "criancas",
    name: "Crianças",
    emoji: "🧸",
    image: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=800&q=70",
    description: "Roupa, calçado e brinquedos.",
  },
  {
    slug: "beleza",
    name: "Beleza",
    emoji: "💄",
    image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=800&q=70",
    description: "Perfumes, cuidados e cosméticos.",
  },
  {
    slug: "acessorios",
    name: "Acessórios",
    emoji: "⌚",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=70",
    description: "Relógios, óculos, malas e gadgets.",
  },
  {
    slug: "moveis",
    name: "Móveis",
    emoji: "🛋️",
    image: "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=800&q=70",
    description: "Sofás, camas, mesas e armários.",
  },
  {
    slug: "cozinha",
    name: "Cozinha",
    emoji: "🍳",
    image: "https://images.unsplash.com/photo-1584990347449-a63e2b662294?auto=format&fit=crop&w=800&q=70",
    description: "Utensílios, panelas e eletroportáteis.",
  },
  {
    slug: "informatica",
    name: "Informática",
    emoji: "💻",
    image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=800&q=70",
    description: "Portáteis, periféricos e redes.",
  },
];

/** Categorias "especiais": não são departamentos do catálogo (ver nota acima). */
export const SPECIAL_CATEGORY_SLUGS = new Set(["todos", "novidades", "ofertas"]);

export function getNewCategory(slug: string): Category | undefined {
  return newCategories.find((c) => c.slug === slug);
}

export function newCategoryEmoji(slug: string): string {
  return newCategories.find((c) => c.slug === slug)?.emoji ?? "🛍️";
}
