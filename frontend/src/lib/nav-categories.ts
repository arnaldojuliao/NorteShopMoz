import { subcategories } from "@/lib/subcategories";

/**
 * Taxonomia de navegação de `/categorias` — a lista de 17 categorias pedidas.
 *
 * Cada categoria de navegação tem um destino SEGURRO para os seus tiles:
 *  - `catalog`  → slug REAL do catálogo do backend (ex.: Mulheres → `moda`);
 *                 os tiles ligam para `/categoria/<catalog>?sub=<slug>`, que
 *                 existe e não dá 404;
 *  - `search`   → tiles ligam para `/explore?q=<termo>`, que nunca dá 404 e
 *                 mostra o que houver no catálogo;
 *  - `special`  → Todos/Novidades/Ofertas, com href explícito (visão geral e
 *                 vistas de explore).
 *
 * As subcategorias reutilizam `@/lib/subcategories` (imagens já validadas);
 * as de Desporto/Crianças são novas. Manter `catalog` igual a um slug que
 * exista em `GET /api/categories` — ver a nota em `new-categories.ts`.
 */

export interface NavSubcategory {
  slug: string;
  name: string;
  image: string;
  href: string;
}

export interface NavCategory {
  slug: string;
  name: string;
  emoji: string;
  image: string;
  /** href quando a categoria aparece como tile na visão «Todos». */
  primaryHref: string;
  /** Slug real do catálogo (badges de oferta e tiles de subcategoria). */
  catalog?: string;
  subcategories: NavSubcategory[];
}

/** Procura uma subcategoria pelo slug (reutiliza nome e imagem validados). */
function sub(slug: string): { name: string; image: string } {
  const found = subcategories.find((s) => s.slug === slug);
  return found ?? { name: slug, image: "" };
}

/** Tiles de uma categoria com catálogo real. */
function catalogSubs(catalog: string, slugs: string[]): NavSubcategory[] {
  return slugs.map((slug) => ({
    slug,
    name: sub(slug).name,
    image: sub(slug).image,
    href: `/categoria/${catalog}?sub=${slug}`,
  }));
}

/** Tiles de uma categoria sem catálogo próprio (pesquisa, nunca 404). */
function searchSubs(term: string, items: { slug: string; name: string; image: string }[]): NavSubcategory[] {
  return items.map((i) => ({
    ...i,
    href: `/explore?q=${encodeURIComponent(term)}`,
  }));
}

export const navCategories: NavCategory[] = [
  {
    slug: "todos",
    name: "Todos",
    emoji: "📦",
    image: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/categorias",
    subcategories: [],
  },
  {
    slug: "novidades",
    name: "Novidades",
    emoji: "✨",
    image: "https://images.unsplash.com/photo-1607083206968-13611e3d76db?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/explore?new=1",
    subcategories: [],
  },
  {
    slug: "ofertas",
    name: "Ofertas",
    emoji: "🔥",
    image: "https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/explore?deal=1",
    subcategories: [],
  },
  {
    slug: "mulheres",
    name: "Mulheres",
    emoji: "👗",
    image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/categoria/mulheres",
    catalog: "mulheres",
    subcategories: catalogSubs("mulheres", [
      "roupas-femininas", "vestidos", "saias", "blusas",
      "calcados-femininos", "bolsas-femininas", "joias-femininas",
    ]),
  },
  {
    slug: "homens",
    name: "Homens",
    emoji: "👔",
    image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/categoria/homens",
    catalog: "homens",
    subcategories: catalogSubs("homens", [
      "roupas-masculinas", "camisetas-masculinas", "calcas-masculinas",
      "calcados-masculinos", "relogios-masculinos", "acessorios-masculinos",
    ]),
  },
  {
    slug: "casa",
    name: "Casa",
    emoji: "🏠",
    image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/categoria/casa",
    catalog: "casa",
    subcategories: catalogSubs("casa", [
      "decoracao-casa", "roupa-cama", "iluminacao",
    ]),
  },
  {
    slug: "calcados",
    name: "Calçados",
    emoji: "👟",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/categoria/calcados",
    catalog: "calcados",
    subcategories: catalogSubs("calcados", [
      "tenis", "sandalias", "sapatos-sociais", "calcados-femininos", "calcados-masculinos",
    ]),
  },
  {
    slug: "eletronicos",
    name: "Eletrónicos",
    emoji: "📺",
    image: "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/categoria/eletronicos",
    catalog: "eletronicos",
    subcategories: catalogSubs("eletronicos", [
      "televisores", "audio", "auscultadores", "acessorios-eletronicos",
    ]),
  },
  {
    slug: "telemoveis",
    name: "Telemóveis",
    emoji: "📱",
    image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/categoria/telemoveis",
    catalog: "telemoveis",
    subcategories: catalogSubs("telemoveis", [
      "smartphones", "capas-peliculas", "carregadores", "auriculares", "acessorios-telemoveis",
    ]),
  },
  {
    slug: "joias",
    name: "Joias",
    emoji: "💍",
    image: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/categoria/joias",
    catalog: "joias",
    subcategories: catalogSubs("joias", [
      "colares", "pulseiras", "aneis", "brincos", "relogios",
    ]),
  },
  {
    slug: "desporto",
    name: "Desporto",
    emoji: "⚽",
    image: "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/categoria/desporto",
    catalog: "desporto",
    subcategories: searchSubs("desporto", [
      { slug: "roupa-desporto", name: "Roupa desportiva", image: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=400&q=70" },
      { slug: "calcados-desporto", name: "Calçado desportivo", image: "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=400&q=70" },
      { slug: "equipamento-desporto", name: "Equipamento", image: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=400&q=70" },
    ]),
  },
  {
    slug: "criancas",
    name: "Crianças",
    emoji: "🧸",
    image: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/categoria/criancas",
    catalog: "criancas",
    subcategories: searchSubs("crianças", [
      { slug: "roupa-criancas", name: "Roupa de criança", image: "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=400&q=70" },
      { slug: "calcados-criancas", name: "Calçado de criança", image: "https://images.unsplash.com/photo-1522771930-78848d9293e8?auto=format&fit=crop&w=400&q=70" },
      { slug: "brinquedos", name: "Brinquedos", image: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=400&q=70" },
    ]),
  },
  {
    slug: "beleza",
    name: "Beleza",
    emoji: "💄",
    image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/categoria/beleza",
    catalog: "beleza",
    subcategories: catalogSubs("beleza", [
      "cuidados-pele", "cabelo", "maquiagem", "perfumes", "higiene-pessoal",
    ]),
  },
  {
    slug: "acessorios",
    name: "Acessórios",
    emoji: "⌚",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/categoria/acessorios",
    catalog: "acessorios",
    subcategories: catalogSubs("acessorios", [
      "bolsas-carteiras", "oculos", "cintos", "relogios-acessorios", "outros-acessorios",
    ]),
  },
  {
    slug: "moveis",
    name: "Móveis",
    emoji: "🛋️",
    image: "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/categoria/moveis",
    catalog: "moveis",
    subcategories: catalogSubs("moveis", [
      "sofas", "camas", "mesas", "cadeiras", "armarios",
    ]),
  },
  {
    slug: "cozinha",
    name: "Cozinha",
    emoji: "🍳",
    image: "https://images.unsplash.com/photo-1584990347449-a63e2b662294?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/categoria/cozinha",
    catalog: "cozinha",
    subcategories: catalogSubs("cozinha", [
      "utensilios-cozinha", "panelas", "louca", "eletroportateis", "organizacao-cozinha",
    ]),
  },
  {
    slug: "informatica",
    name: "Informática",
    emoji: "💻",
    image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=800&q=70",
    primaryHref: "/categoria/informatica",
    catalog: "informatica",
    subcategories: catalogSubs("informatica", [
      "computadores", "portateis", "teclados-ratos", "monitores", "acessorios-informatica",
    ]),
  },
];

/** Categorias "especiais": não são departamentos do catálogo (ver nota acima). */
export const NAV_SPECIAL_SLUGS = new Set(["todos", "novidades", "ofertas"]);

export function getNavCategory(slug: string): NavCategory | undefined {
  return navCategories.find((c) => c.slug === slug);
}
