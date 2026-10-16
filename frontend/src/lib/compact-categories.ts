/**
 * Faixa de categorias do cabeçalho — as 17 entradas da navegação da loja.
 *
 * Os `href` de departamento apontam para slugs REAIS do catálogo do backend
 * (`/categoria/<slug>` devolve 404 para slugs desconhecidas) — ver a nota em
 * `new-categories.ts`. As três primeiras entradas são vistas e não categorias
 * (não têm página própria): Todos → catálogo completo, Novidades → recém-
 * chegados, Ofertas → descontos.
 */
export interface CompactCategory {
  id: string;
  label: string;
  href: string;
}

export const compactCategories: CompactCategory[] = [
  { id: "all", label: "Todos", href: "/explore" },
  { id: "new", label: "Novidades", href: "/explore?new=1" },
  { id: "offers", label: "Ofertas", href: "/explore?deal=1" },
  { id: "mulheres", label: "Mulheres", href: "/categoria/mulheres" },
  { id: "homens", label: "Homens", href: "/categoria/homens" },
  { id: "casa", label: "Casa", href: "/categoria/casa" },
  { id: "calcados", label: "Calçados", href: "/categoria/calcados" },
  { id: "eletronicos", label: "Eletrónicos", href: "/categoria/eletronicos" },
  { id: "telemoveis", label: "Telemóveis", href: "/categoria/telemoveis" },
  { id: "joias", label: "Joias", href: "/categoria/joias" },
  { id: "desporto", label: "Desporto", href: "/categoria/desporto" },
  { id: "criancas", label: "Crianças", href: "/categoria/criancas" },
  { id: "beleza", label: "Beleza", href: "/categoria/beleza" },
  { id: "acessorios", label: "Acessórios", href: "/categoria/acessorios" },
  { id: "moveis", label: "Móveis", href: "/categoria/moveis" },
  { id: "cozinha", label: "Cozinha", href: "/categoria/cozinha" },
  { id: "informatica", label: "Informática", href: "/categoria/informatica" },
];
