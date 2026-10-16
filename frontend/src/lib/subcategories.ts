// import type { Category } from "@/lib/types";

export interface Subcategory {
  id: string;
  name: string;
  slug: string;
  parentSlug: string;
  image: string;
  description: string;
  hasDeals?: boolean;
}

export const subcategories: Subcategory[] = [
  { id: "mulheres-roupas", name: "Roupas femininas", slug: "roupas-femininas", parentSlug: "mulheres", image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=400&q=70", description: "Blusas, vestidos, saias e mais" },
  { id: "mulheres-vestidos", name: "Vestidos", slug: "vestidos", parentSlug: "mulheres", image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=400&q=70", description: "Vestidos casuais e formais" },
  { id: "mulheres-saias", name: "Saias", slug: "saias", parentSlug: "mulheres", image: "https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=400&q=70", description: "Saias de vários estilos" },
  { id: "mulheres-blusas", name: "Blusas", slug: "blusas", parentSlug: "mulheres", image: "https://images.unsplash.com/photo-1564257977-3f0f2c7d8d8e?auto=format&fit=crop&w=400&q=70", description: "Blusas e tops femininos" },
  { id: "mulheres-calcados", name: "Calçados femininos", slug: "calcados-femininos", parentSlug: "calcados", image: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=400&q=70", description: "Sapatos, sandálias e botas" },
  { id: "mulheres-bolsas", name: "Bolsas femininas", slug: "bolsas-femininas", parentSlug: "acessorios", image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=400&q=70", description: "Bolsas, mochilas e carteiras" },
  { id: "mulheres-joias", name: "Joias femininas", slug: "joias-femininas", parentSlug: "joias", image: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=400&q=70", description: "Colares, brincos, anéis e pulseiras" },

  { id: "homens-roupas", name: "Roupas masculinas", slug: "roupas-masculinas", parentSlug: "homens", image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=400&q=70", description: "Camisas, camisetas, calças e mais" },
  { id: "homens-camisetas", name: "Camisetas masculinas", slug: "camisetas-masculinas", parentSlug: "homens", image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=400&q=70", description: "Camisetas básicas e estampadas" },
  { id: "homens-calcados", name: "Calçados masculinos", slug: "calcados-masculinos", parentSlug: "calcados", image: "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?auto=format&fit=crop&w=400&q=70", description: "Tênis, sapatos sociais e botas" },
  { id: "homens-calcas", name: "Calças masculinas", slug: "calcas-masculinas", parentSlug: "homens", image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=400&q=70", description: "Jeans, sociais e casuais" },
  { id: "homens-relogios", name: "Relógios masculinos", slug: "relogios-masculinos", parentSlug: "acessorios", image: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=400&q=70", description: "Relógios analógicos e digitais" },
  { id: "homens-acessorios", name: "Acessórios masculinos", slug: "acessorios-masculinos", parentSlug: "acessorios", image: "https://images.unsplash.com/photo-1602391833977-358a52198938?auto=format&fit=crop&w=400&q=70", description: "Cintos, carteiras e bonés" },

  { id: "casa-cozinha", name: "Casa e cozinha", slug: "casa-cozinha", parentSlug: "casa", image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=400&q=70", description: "Utensílios, panelas e organização" },
  { id: "casa-decoracao", name: "Decoração para casa", slug: "decoracao-casa", parentSlug: "casa", image: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=400&q=70", description: "Almofadas, quadros, vasos e tapetes" },
  { id: "casa-moveis-sala", name: "Móveis de sala", slug: "moveis-sala", parentSlug: "casa", image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=400&q=70", description: "Sofás, poltronas e racks" },
  { id: "casa-moveis-quarto", name: "Móveis de quarto", slug: "moveis-quarto", parentSlug: "casa", image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=400&q=70", description: "Camas, guarda-roupas e criados" },
  { id: "casa-roupa-cama", name: "Roupa de cama", slug: "roupa-cama", parentSlug: "casa", image: "https://images.unsplash.com/photo-1584100936595-c0654b511176?auto=format&fit=crop&w=400&q=70", description: "Lençóis, edredons e travesseiros" },
  { id: "casa-iluminacao", name: "Iluminação", slug: "iluminacao", parentSlug: "casa", image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=400&q=70", description: "Lustres, abajures e fitas LED" },

  { id: "calcados-tenis", name: "Tênis", slug: "tenis", parentSlug: "calcados", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=70", description: "Tênis esportivos e casuais" },
  { id: "calcados-sandalias", name: "Sandálias", slug: "sandalias", parentSlug: "calcados", image: "https://images.unsplash.com/photo-1602810358310-4d8b5d2b5f7a?auto=format&fit=crop&w=400&q=70", description: "Sandálias rasteiras e de salto" },
  { id: "calcados-sociais", name: "Sapatos sociais", slug: "sapatos-sociais", parentSlug: "calcados", image: "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?auto=format&fit=crop&w=400&q=70", description: "Sapatos formais e Oxford" },

  { id: "eletronicos-tvs", name: "Televisores", slug: "televisores", parentSlug: "eletronicos", image: "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=400&q=70", description: "Smart TVs 4K, 8K e OLED" },
  { id: "eletronicos-audio", name: "Áudio", slug: "audio", parentSlug: "eletronicos", image: "https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=400&q=70", description: "Caixas de som, soundbars e home theater" },
  { id: "eletronicos-auscultadores", name: "Auscultadores", slug: "auscultadores", parentSlug: "eletronicos", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=400&q=70", description: "Fones over-ear, in-ear e headsets" },
  { id: "eletronicos-acessorios", name: "Acessórios eletrónicos", slug: "acessorios-eletronicos", parentSlug: "eletronicos", image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=400&q=70", description: "Cabos, carregadores, adaptadores" },

  { id: "telemoveis-smartphones", name: "Smartphones", slug: "smartphones", parentSlug: "telemoveis", image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=400&q=70", description: "iPhone, Samsung, Xiaomi e mais" },
  { id: "telemoveis-capinhas", name: "Capas e películas", slug: "capas-peliculas", parentSlug: "telemoveis", image: "https://images.unsplash.com/photo-1556656793-08538906a9f8?auto=format&fit=crop&w=400&q=70", description: "Proteção para seu smartphone" },
  { id: "telemoveis-carregadores", name: "Carregadores", slug: "carregadores", parentSlug: "telemoveis", image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=400&q=70", description: "Carregadores rápidos, power banks" },
  { id: "telemoveis-auriculares", name: "Auriculares", slug: "auriculares", parentSlug: "telemoveis", image: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=400&q=70", description: "Fones TWS, Bluetooth e com fio" },
  { id: "telemoveis-acessorios", name: "Acessórios para telemóveis", slug: "acessorios-telemoveis", parentSlug: "telemoveis", image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=400&q=70", description: "Suportes, anéis, lentes e mais" },

  { id: "joias-colares", name: "Colares", slug: "colares", parentSlug: "acessorios", image: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=400&q=70", description: "Colares, gargantilhas e pendentes" },
  { id: "joias-pulseiras", name: "Pulseiras", slug: "pulseiras", parentSlug: "acessorios", image: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=400&q=70", description: "Pulseiras de prata, ouro e couro" },
  { id: "joias-aneis", name: "Anéis", slug: "aneis", parentSlug: "acessorios", image: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=400&q=70", description: "Anéis solitários, alianças e aparadores" },
  { id: "joias-brincos", name: "Brincos", slug: "brincos", parentSlug: "acessorios", image: "https://images.unsplash.com/photo-1630019852942-f89202981a66?auto=format&fit=crop&w=400&q=70", description: "Brincos de argola, studs e ear cuffs" },
  { id: "joias-relogios", name: "Relógios", slug: "relogios", parentSlug: "acessorios", image: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=400&q=70", description: "Relógios de pulso femininos e masculinos" },



  { id: "beleza-pele", name: "Cuidados com a pele", slug: "cuidados-pele", parentSlug: "beleza", image: "https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?auto=format&fit=crop&w=400&q=70", description: "Cremes, séruns, protetores e limpeza" },
  { id: "beleza-cabelo", name: "Cabelo", slug: "cabelo", parentSlug: "beleza", image: "https://images.unsplash.com/photo-1522338140262-f46f5913618a?auto=format&fit=crop&w=400&q=70", description: "Shampoos, condicionadores, máscaras e finalizadores" },
  { id: "beleza-maquiagem", name: "Maquilhagem", slug: "maquiagem", parentSlug: "beleza", image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=400&q=70", description: "Base, batom, sombra, rímel e pincéis" },
  { id: "beleza-perfumes", name: "Perfumes", slug: "perfumes", parentSlug: "beleza", image: "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=400&q=70", description: "Perfumes masculinos, femininos e unissex" },
  { id: "beleza-higiene", name: "Higiene pessoal", slug: "higiene-pessoal", parentSlug: "beleza", image: "https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?auto=format&fit=crop&w=400&q=70", description: "Sabonetes, desodorantes, cremes dentais" },

  { id: "acessorios-bolsas", name: "Bolsas e carteiras", slug: "bolsas-carteiras", parentSlug: "acessorios", image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=400&q=70", description: "Bolsas de mão, mochilas, pochetes" },
  { id: "acessorios-oculos", name: "Óculos", slug: "oculos", parentSlug: "acessorios", image: "https://images.unsplash.com/photo-1511499767150-a48a237f4083?auto=format&fit=crop&w=400&q=70", description: "Óculos de sol e de grau" },
  { id: "acessorios-cintos", name: "Cintos", slug: "cintos", parentSlug: "acessorios", image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=400&q=70", description: "Cintos de couro, tecido e sintéticos" },
  { id: "acessorios-relogios", name: "Relógios", slug: "relogios-acessorios", parentSlug: "acessorios", image: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=400&q=70", description: "Relógios analógicos, digitais e smartwatches" },
  { id: "acessorios-outros", name: "Outros acessórios", slug: "outros-acessorios", parentSlug: "acessorios", image: "https://images.unsplash.com/photo-1602391833977-358a52198938?auto=format&fit=crop&w=400&q=70", description: "Lenços, chapéus, luvas, chaveiros" },

  { id: "moveis-sofas", name: "Sofás", slug: "sofas", parentSlug: "casa", image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=400&q=70", description: "Sofás de 2, 3 lugares e retráteis" },
  { id: "moveis-camas", name: "Camas", slug: "camas", parentSlug: "casa", image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=400&q=70", description: "Camas box, casal, queen, king e solteiro" },
  { id: "moveis-mesas", name: "Mesas", slug: "mesas", parentSlug: "casa", image: "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=400&q=70", description: "Mesas de jantar, centro, escritório e lateral" },
  { id: "moveis-cadeiras", name: "Cadeiras", slug: "cadeiras", parentSlug: "casa", image: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=400&q=70", description: "Cadeiras de jantar, escritório, gaming" },
  { id: "moveis-armarios", name: "Armários", slug: "armarios", parentSlug: "casa", image: "https://images.unsplash.com/photo-1594620302200-9a7da9560961?auto=format&fit=crop&w=400&q=70", description: "Guarda-roupas, sapateiras e estantes" },

  { id: "cozinha-utensilios", name: "Utensílios de cozinha", slug: "utensilios-cozinha", parentSlug: "casa", image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=400&q=70", description: "Talheres, facas, tábuas, medidores" },
  { id: "cozinha-panelas", name: "Panelas", slug: "panelas", parentSlug: "casa", image: "https://images.unsplash.com/photo-1584990347449-a63e2b662294?auto=format&fit=crop&w=400&q=70", description: "Conjuntos, frigideiras, caçarolas, woks" },
  { id: "cozinha-louca", name: "Louça", slug: "louca", parentSlug: "casa", image: "https://images.unsplash.com/photo-1518455027359-f1fdf1fcc8b1?auto=format&fit=crop&w=400&q=70", description: "Pratos, xícaras, tigelas, travessas" },
  { id: "cozinha-eletroportateis", name: "Pequenos eletrodomésticos", slug: "eletroportateis", parentSlug: "casa", image: "https://images.unsplash.com/photo-1570222094114-d054a817e56b?auto=format&fit=crop&w=400&q=70", description: "Liquidificadores, air fryers, batedeiras" },
  { id: "cozinha-organizacao", name: "Organização da cozinha", slug: "organizacao-cozinha", parentSlug: "casa", image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=400&q=70", description: "Potes, organizadores, porta-temperos" },

  { id: "informatica-computadores", name: "Computadores", slug: "computadores", parentSlug: "informatica", image: "https://images.unsplash.com/photo-1587831990711-23ca64414476?auto=format&fit=crop&w=400&q=70", description: "Desktops, workstations e all-in-one" },
  { id: "informatica-portateis", name: "Portáteis", slug: "portateis", parentSlug: "informatica", image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=400&q=70", description: "Notebooks, ultrabooks e 2-em-1" },
  { id: "informatica-teclados", name: "Teclados e ratos", slug: "teclados-ratos", parentSlug: "informatica", image: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=400&q=70", description: "Mecânicos, sem fio, ergonômicos, gamers" },
  { id: "informatica-monitores", name: "Monitores", slug: "monitores", parentSlug: "informatica", image: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=400&q=70", description: "Gamers, profissionais, ultrawide, 4K" },
  { id: "informatica-acessorios", name: "Acessórios de informática", slug: "acessorios-informatica", parentSlug: "informatica", image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=400&q=70", description: "Hubs, cabos, suportes, webcams, headsets" },

  { id: "novidades-produtos", name: "Produtos recentes", slug: "produtos-recentes", parentSlug: "novidades", image: "https://images.unsplash.com/photo-1607083206968-13611e3d76db?auto=format&fit=crop&w=400&q=70", description: "Últimas novidades do catálogo" },

  { id: "ofertas-produtos", name: "Produtos em oferta", slug: "produtos-oferta", parentSlug: "ofertas", image: "https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=400&q=70", description: "Descontos reais e ativos", hasDeals: true },

  { id: "todos-categorias", name: "Todas as categorias", slug: "todas-categorias", parentSlug: "todos", image: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=400&q=70", description: "Visão geral de todas as categorias" },
];

export function getSubcategoriesByParent(parentSlug: string): Subcategory[] {
  return subcategories.filter((s) => s.parentSlug === parentSlug);
}

export function getSubcategory(slug: string): Subcategory | undefined {
  return subcategories.find((s) => s.slug === slug);
}