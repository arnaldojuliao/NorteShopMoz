import type { Product } from "@/lib/types";

/**
 * Catálogo da NorteShopMoz — dados mock em Meticais (MT).
 * Quando o backend Spring Boot estiver disponível, este módulo é
 * substituído por chamadas REST (ver lib/repo.ts).
 *
 * Os 100 produtos são declarados de forma enxuta e normalizados por
 * `product()`, que aplica as regras comuns:
 *   • `oldPrice` = preço + 15% → gera o selo **OFERTA** em toda a loja;
 *   • `images` a partir da lista da categoria;
 *   • `badges` derivados (OFERTA sempre; NOVO/MAIS VENDIDO conforme os flags);
 *   • defaults de rating, stock, prazo de entrega, etc.
 */

const u = (id: string, w = 900) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

/** Fotos de apoio por categoria, reaproveitadas entre os produtos da mesma. */
const IMAGES: Record<string, string[]> = {
  telemoveis: [
    "photo-1511707171634-5f897ff02aa9",
    "photo-1598327105666-5b89351aff97",
    "photo-1556656793-08538906a9f8",
    "photo-1609091839311-d5365f9ff1c5",
    "photo-1609592806590-c4fb17ea506e",
    "photo-1546868871-7041f2a55e12",
    "photo-1523275335684-37898b6baf30",
  ],
  eletronicos: [
    "photo-1593359677879-a4bb92f829d1",
    "photo-1593784991095-a205069470b6",
    "photo-1608043152269-423dbba4e7e1",
    "photo-1589003077984-894e133dabab",
    "photo-1505740420928-5e560c06d30e",
    "photo-1546435770-a3e426bf472b",
    "photo-1526170375885-4d8ecf77b99f",
    "photo-1512790182412-b19e6d62bc39",
    "photo-1473968512647-3e447244af8f",
    "photo-1527977966376-1c8408f9f108",
    "photo-1599669454699-248893623440",
    "photo-1593305841991-05c297ba4575",
    "photo-1522869635100-9f4c5e86aa37",
    "photo-1601944177325-f8867652837f",
  ],
  informatica: [
    "photo-1496181133206-80ce9b88a853",
    "photo-1517336714731-489689fd1ca8",
    "photo-1587829741301-dc798b83add3",
    "photo-1541140532154-b024d705b90a",
    "photo-1527814050087-3793815479db",
    "photo-1615663245857-ac93bb7c39e7",
    "photo-1547082299-de196ea013d6",
    "photo-1527443224154-c4a3942d3acf",
    "photo-1561154464-82e9adf32764",
    "photo-1585790050230-5dd28404ccb9",
  ],
  casa: [
    "photo-1555041469-a586c61ea9bc",
    "photo-1550226891-ef816aed4a98",
    "photo-1567538096630-e0c55bd6374c",
    "photo-1598300042247-d088f8ab3a91",
    "photo-1507473885765-e6ed057f782c",
    "photo-1513506003901-1e6a229e2d15",
    "photo-1584568694244-14fbdf83bd30",
    "photo-1574269909862-7e1d70bb8078",
    "photo-1517668808822-9ebb02f2a0e6",
    "photo-1495474472287-4d71bcdd2085",
    "photo-1556911220-bff31c812dba",
    "photo-1584990347449-a2a4d47e055b",
    "photo-1586023492125-27b2c045efd7",
    "photo-1567016432779-094069958ea5",
  ],
  moda: [
    "photo-1542291026-7eec264c27ff",
    "photo-1560769629-975ec94e6a86",
    "photo-1521572163474-6864f9cf17ab",
    "photo-1583743814966-8936f5b7be1a",
    "photo-1595777457583-95e059d581b8",
    "photo-1539008835657-9e8e9680c956",
    "photo-1542272604-787c3835535d",
    "photo-1551537482-f2075a1d41f2",
    "photo-1600185365926-3a2ce3cdb9eb",
  ],
  beleza: [
    "photo-1541643600914-78b084683601",
    "photo-1594035910387-fea47794261f",
    "photo-1596462502278-27bfdc403348",
    "photo-1596704017254-9b121068fb31",
    "photo-1556228720-195a672e8a03",
    "photo-1570172619644-dfd03ed5d881",
    "photo-1522338242992-e1a54906a8da",
    "photo-1595476108010-b4d1f102b1b1",
  ],
  acessorios: [
    "photo-1524592094714-0f0654e20314",
    "photo-1523275335684-37898b6baf30",
    "photo-1572635196237-14b3f281503f",
    "photo-1511499767150-a48a237f0083",
    "photo-1553062407-98eeb64c6a62",
    "photo-1581605405669-fcdf81165afa",
    "photo-1575311373937-040b8e1fd5b6",
    "photo-1546868871-7041f2a55e12",
  ],
};

/** Escolhe 3 fotos da categoria, rodando pelo número do produto para variar. */
function pickImages(category: string, id: string): string[] {
  const pool = IMAGES[category] ?? [];
  if (pool.length === 0) return [];
  const n = Number(id.replace(/\D/g, "")) || 0;
  const start = n % pool.length;
  const count = Math.min(3, pool.length);
  return Array.from({ length: count }, (_, i) => u(pool[(start + i) % pool.length]));
}

interface Seed {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  shortDescription: string;
  specs: { label: string; value: string }[];
  tags: string[];
  brand?: string;
  rating?: number;
  ratingCount?: number;
  sold?: number;
  stock?: number;
  deliveryDays?: [number, number];
  freeShipping?: boolean;
  featured?: boolean;
  bestseller?: boolean;
  isNew?: boolean;
  dealOfDay?: boolean;
  variants?: NonNullable<Product["variants"]>;
}

function product(s: Seed): Product {
  const badges: Product["badges"] = ["OFERTA"];
  if (s.isNew) badges.push("NOVO");
  if (s.bestseller) badges.push("MAIS VENDIDO");
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    brand: s.brand,
    category: s.category,
    price: s.price,
    oldPrice: Math.round(s.price * 1.15),
    rating: s.rating ?? 4.5,
    ratingCount: s.ratingCount ?? 120,
    sold: s.sold ?? 180,
    stock: s.stock ?? 40,
    images: pickImages(s.category, s.id),
    shortDescription: s.shortDescription,
    description: [
      s.shortDescription,
      `${s.name} com stock no armazém de Maputo e envio para todas as províncias de Moçambique.`,
    ],
    specs: s.specs,
    badges,
    featured: s.featured,
    bestseller: s.bestseller,
    isNew: s.isNew,
    dealOfDay: s.dealOfDay,
    variants: s.variants,
    deliveryDays: s.deliveryDays ?? [3, 7],
    freeShipping: s.freeShipping,
    tags: s.tags,
  };
}

export const products: Product[] = [
  /* ── Telemóveis ─────────────────────────────────────────────── */
  product({
    id: "p-001", slug: "capa-para-iphone", name: "Capa para iPhone",
    category: "telemoveis", brand: "NSM", price: 800,
    shortDescription: "Capa protetora resistente a quedas, com acabamento antiderrapante.",
    specs: [{ label: "Material", value: "TPU + policarbonato" }, { label: "Compatibilidade", value: "iPhone (vários modelos)" }],
    tags: ["capa", "protecao", "iphone"],
    bestseller: true, dealOfDay: true, freeShipping: true,
    variants: [{ type: "Cor", options: [{ name: "Preto", hex: "#111827" }, { name: "Transparente" }, { name: "Azul", hex: "#1d4ed8" }] }],
  }),
  product({
    id: "p-002", slug: "capa-para-samsung-galaxy", name: "Capa para Samsung Galaxy",
    category: "telemoveis", brand: "NSM", price: 800,
    shortDescription: "Capa com cantos reforçados e corte preciso para câmaras e portas.",
    specs: [{ label: "Material", value: "Silicone flexível" }, { label: "Compatibilidade", value: "Samsung Galaxy (vários modelos)" }],
    tags: ["capa", "protecao", "samsung"],
    variants: [{ type: "Cor", options: [{ name: "Preto", hex: "#111827" }, { name: "Rosa", hex: "#ec4899" }] }],
  }),
  product({
    id: "p-003", slug: "capa-para-tecno", name: "Capa para Tecno",
    category: "telemoveis", brand: "NSM", price: 700,
    shortDescription: "Capa leve com textura mate que não deixa dedadas.",
    specs: [{ label: "Material", value: "TPU" }, { label: "Compatibilidade", value: "Tecno (vários modelos)" }],
    tags: ["capa", "protecao", "tecno"],
  }),
  product({
    id: "p-004", slug: "capa-para-infinix", name: "Capa para Infinix",
    category: "telemoveis", brand: "NSM", price: 700,
    shortDescription: "Proteção completa com bordas elevadas para o ecrã e as câmaras.",
    specs: [{ label: "Material", value: "TPU" }, { label: "Compatibilidade", value: "Infinix (vários modelos)" }],
    tags: ["capa", "protecao", "infinix"],
  }),
  product({
    id: "p-005", slug: "pelicula-de-vidro", name: "Película de vidro",
    category: "telemoveis", brand: "NSM", price: 500,
    shortDescription: "Vidro temperado 9H, antirriscos e resistente a impactos.",
    specs: [{ label: "Dureza", value: "9H" }, { label: "Compatibilidade", value: "Universal (vários ecrãs)" }],
    tags: ["pelicula", "vidro", "protecao"],
    bestseller: true, dealOfDay: true, freeShipping: true,
  }),
  product({
    id: "p-006", slug: "pelicula-hidrogel", name: "Película hidrogel",
    category: "telemoveis", brand: "NSM", price: 600,
    shortDescription: "Película flexível que absorve impactos e não quebra nas bordas.",
    specs: [{ label: "Material", value: "Hidrogel flexível" }, { label: "Acabamento", value: "Mate antidedadas" }],
    tags: ["pelicula", "hidrogel", "protecao"],
  }),
  product({
    id: "p-007", slug: "carregador-rapido-usb-c", name: "Carregador rápido USB-C",
    category: "telemoveis", brand: "VoltGo", price: 1500,
    shortDescription: "Carregador de parede 33W com porta USB-C e proteção contra sobrecarga.",
    specs: [{ label: "Potência", value: "33W" }, { label: "Portas", value: "1× USB-C + 1× USB-A" }],
    tags: ["carregador", "usb-c", "carga rapida"],
    freeShipping: true,
  }),
  product({
    id: "p-008", slug: "cabo-usb-c-1-m", name: "Cabo USB-C 1 m",
    category: "telemoveis", brand: "VoltGo", price: 700,
    shortDescription: "Cabo reforçado de 1 metro para carregamento e transferência de dados.",
    specs: [{ label: "Comprimento", value: "1 m" }, { label: "Corrente", value: "3 A" }],
    tags: ["cabo", "usb-c", "carregamento"],
  }),
  product({
    id: "p-009", slug: "cabo-lightning", name: "Cabo Lightning",
    category: "telemoveis", brand: "VoltGo", price: 800,
    shortDescription: "Cabo Lightning certificado, compatível com iPhone e iPad.",
    specs: [{ label: "Comprimento", value: "1 m" }, { label: "Compatibilidade", value: "iPhone / iPad" }],
    tags: ["cabo", "lightning", "iphone"],
  }),
  product({
    id: "p-010", slug: "cabo-usb-c-usb-c", name: "Cabo USB-C → USB-C",
    category: "telemoveis", brand: "VoltGo", price: 900,
    shortDescription: "Cabo USB-C para USB-C com suporte a carga rápida de até 65W.",
    specs: [{ label: "Comprimento", value: "1 m" }, { label: "Potência", value: "até 65W" }],
    tags: ["cabo", "usb-c", "carga rapida"],
  }),
  product({
    id: "p-011", slug: "power-bank-10000-mah", name: "Power bank 10.000 mAh",
    category: "telemoveis", brand: "VoltGo", price: 2500,
    shortDescription: "Bateria externa compacta que carrega o telemóvel até 2 vezes.",
    specs: [{ label: "Capacidade", value: "10.000 mAh" }, { label: "Saídas", value: "2× USB + 1× USB-C" }],
    tags: ["power bank", "bateria", "portatil"],
    bestseller: true, freeShipping: true,
  }),
  product({
    id: "p-012", slug: "power-bank-20000-mah", name: "Power bank 20.000 mAh",
    category: "telemoveis", brand: "VoltGo", price: 3500,
    shortDescription: "Carregue vários dispositivos até 4 vezes, com carga rápida de 22,5W.",
    specs: [{ label: "Capacidade", value: "20.000 mAh" }, { label: "Carga rápida", value: "22,5W" }],
    tags: ["power bank", "bateria", "carga rapida"],
    bestseller: true, dealOfDay: true, freeShipping: true,
  }),
  product({
    id: "p-013", slug: "suporte-de-telemovel", name: "Suporte de telemóvel",
    category: "telemoveis", brand: "NSM", price: 1000,
    shortDescription: "Suporte ajustável de mesa para videochamadas e vídeos.",
    specs: [{ label: "Material", value: "Alumínio" }, { label: "Ângulo", value: "Ajustável 0–90°" }],
    tags: ["suporte", "mesa", "acessorio"],
  }),
  product({
    id: "p-014", slug: "adaptador-otg-usb-c", name: "Adaptador OTG USB-C",
    category: "telemoveis", brand: "NSM", price: 600,
    shortDescription: "Ligue pens, teclados ou ratos ao telemóvel por USB-C.",
    specs: [{ label: "Entrada", value: "USB-C macho" }, { label: "Saída", value: "USB-A fêmea" }],
    tags: ["otg", "adaptador", "usb-c"],
  }),
  product({
    id: "p-015", slug: "suporte-magnetico-para-carro", name: "Suporte magnético para carro",
    category: "telemoveis", brand: "NSM", price: 1200,
    shortDescription: "Base magnética forte para o tablier, com rotação de 360°.",
    specs: [{ label: "Fixação", value: "Magnética" }, { label: "Rotação", value: "360°" }],
    tags: ["suporte", "carro", "magnetico"],
  }),

  /* ── Eletrónicos ────────────────────────────────────────────── */
  product({
    id: "p-016", slug: "auscultadores-tws", name: "Auscultadores TWS",
    category: "eletronicos", brand: "SoundPro", price: 4000,
    shortDescription: "Auscultadores Bluetooth verdadeiramente sem fios com estojo de carga.",
    specs: [{ label: "Bluetooth", value: "5.3" }, { label: "Autonomia", value: "até 24 h com estojo" }],
    tags: ["auscultadores", "tws", "bluetooth"],
    bestseller: true, isNew: true, freeShipping: true,
    variants: [{ type: "Cor", options: [{ name: "Preto", hex: "#111827" }, { name: "Branco", hex: "#f8fafc" }] }],
  }),
  product({
    id: "p-017", slug: "auscultadores-com-fio", name: "Auscultadores com fio",
    category: "eletronicos", brand: "SoundPro", price: 3000,
    shortDescription: "Auscultadores over-ear com som equilibrado e microfone integrado.",
    specs: [{ label: "Ligação", value: "Jack 3,5 mm" }, { label: "Microfone", value: "Integrado" }],
    tags: ["auscultadores", "fio", "audio"],
  }),
  product({
    id: "p-018", slug: "coluna-bluetooth-portatil", name: "Coluna Bluetooth portátil",
    category: "eletronicos", brand: "Boom", price: 4500,
    shortDescription: "Som potente e resistente a salpicos, com bateria para todo o dia.",
    specs: [{ label: "Potência", value: "20W" }, { label: "Resistência", value: "IPX6" }],
    tags: ["coluna", "bluetooth", "audio"],
    bestseller: true, freeShipping: true,
  }),
  product({
    id: "p-019", slug: "smartwatch", name: "Smartwatch",
    category: "eletronicos", brand: "PulseFit", price: 6000,
    shortDescription: "Relógio inteligente com chamadas, notificações e monitor de saúde.",
    specs: [{ label: "Ecrã", value: "AMOLED 1,9\"" }, { label: "Bateria", value: "até 7 dias" }],
    tags: ["smartwatch", "relogio", "fitness"],
    featured: true, dealOfDay: true, freeShipping: true,
    variants: [{ type: "Cor", options: [{ name: "Preto", hex: "#111827" }, { name: "Prateado", hex: "#cbd5e1" }] }],
  }),
  product({
    id: "p-020", slug: "smart-band", name: "Smart band",
    category: "eletronicos", brand: "PulseFit", price: 2500,
    shortDescription: "Pulseira de atividade que mede passos, sono e ritmo cardíaco.",
    specs: [{ label: "Ecrã", value: "TFT 1,47\"" }, { label: "Bateria", value: "até 10 dias" }],
    tags: ["smart band", "pulseira", "fitness"],
    isNew: true,
  }),
  product({
    id: "p-021", slug: "ring-light-26-cm", name: "Ring light 26 cm",
    category: "eletronicos", brand: "StudioLite", price: 1800,
    shortDescription: "Iluminação circular com três tons de luz para vídeos e selfies.",
    specs: [{ label: "Diâmetro", value: "26 cm" }, { label: "Tons", value: "Frio · neutro · quente" }],
    tags: ["ring light", "iluminacao", "conteudo"],
  }),
  product({
    id: "p-022", slug: "ring-light-45-cm", name: "Ring light 45 cm",
    category: "eletronicos", brand: "StudioLite", price: 3000,
    shortDescription: "Ring light grande com tripé de 2 m e suporte para telemóvel.",
    specs: [{ label: "Diâmetro", value: "45 cm" }, { label: "Tripé", value: "até 2 m" }],
    tags: ["ring light", "iluminacao", "estudio"],
  }),
  product({
    id: "p-023", slug: "tripe-para-telemovel", name: "Tripé para telemóvel",
    category: "eletronicos", brand: "StudioLite", price: 1500,
    shortDescription: "Tripé extensível com garra regulável e nível de bolha.",
    specs: [{ label: "Altura", value: "50–150 cm" }, { label: "Suporte", value: "Telemóvel até 6,7\"" }],
    tags: ["tripe", "suporte", "fotografia"],
  }),
  product({
    id: "p-024", slug: "microfone-de-lapela", name: "Microfone de lapela",
    category: "eletronicos", brand: "SoundPro", price: 2000,
    shortDescription: "Microfone lavalier com clipe e capa de vento para gravações limpas.",
    specs: [{ label: "Ligação", value: "Jack 3,5 mm" }, { label: "Cabo", value: "2 m" }],
    tags: ["microfone", "lapela", "gravacao"],
  }),
  product({
    id: "p-025", slug: "microfone-condensador", name: "Microfone condensador",
    category: "eletronicos", brand: "SoundPro", price: 3500,
    shortDescription: "Microfone USB para podcast e streaming, com tripé incluído.",
    specs: [{ label: "Padrão", value: "Cardioide" }, { label: "Ligação", value: "USB" }],
    tags: ["microfone", "condensador", "podcast"],
  }),
  product({
    id: "p-026", slug: "fita-led-rgb", name: "Fita LED RGB",
    category: "eletronicos", brand: "LumiFlex", price: 1500,
    shortDescription: "5 metros de fita LED adesiva controlada por app ou comando.",
    specs: [{ label: "Comprimento", value: "5 m" }, { label: "Controlo", value: "App + comando" }],
    tags: ["led", "rgb", "iluminacao"],
    isNew: true,
  }),
  product({
    id: "p-027", slug: "camara-wifi-de-vigilancia", name: "Câmara Wi-Fi de vigilância",
    category: "eletronicos", brand: "GuardHome", price: 4000,
    shortDescription: "Câmara 1080p com visão noturna, áudio bidirecional e app.",
    specs: [{ label: "Resolução", value: "1080p Full HD" }, { label: "Visão noturna", value: "até 10 m" }],
    tags: ["camara", "wifi", "vigilancia"],
  }),
  product({
    id: "p-028", slug: "tv-box-android", name: "TV Box Android",
    category: "eletronicos", brand: "StreamOne", price: 4500,
    shortDescription: "Transforme qualquer TV numa smart TV com Android e 4K.",
    specs: [{ label: "Resolução", value: "4K UHD" }, { label: "Memória", value: "4 GB RAM · 32 GB" }],
    tags: ["tv box", "android", "streaming"],
  }),
  product({
    id: "p-029", slug: "game-stick-4k", name: "Game stick 4K",
    category: "eletronicos", brand: "StreamOne", price: 3500,
    shortDescription: "Consola retro com dois comandos e milhares de jogos clássicos.",
    specs: [{ label: "Saída", value: "HDMI 4K" }, { label: "Comandos", value: "2 sem fios" }],
    tags: ["game stick", "consola", "retro"],
    isNew: true,
  }),
  product({
    id: "p-030", slug: "projetor-portatil", name: "Projetor portátil",
    category: "eletronicos", brand: "StreamOne", price: 9000,
    shortDescription: "Projeta até 120\" com Wi-Fi, HDMI e espelhamento do telemóvel.",
    specs: [{ label: "Resolução", value: "1080p suportado" }, { label: "Ecrã", value: "até 120\"" }],
    tags: ["projetor", "portatil", "cinema"],
    featured: true, freeShipping: true,
  }),

  /* ── Informática ────────────────────────────────────────────── */
  product({
    id: "p-031", slug: "rato-sem-fio", name: "Rato sem fio",
    category: "informatica", brand: "ClickPro", price: 1200,
    shortDescription: "Rato ergonómico silencioso com recetor USB e ligação 2,4 GHz.",
    specs: [{ label: "Ligação", value: "2,4 GHz USB" }, { label: "DPI", value: "800–1600" }],
    tags: ["rato", "sem fio", "pc"],
  }),
  product({
    id: "p-032", slug: "teclado-sem-fio", name: "Teclado sem fio",
    category: "informatica", brand: "ClickPro", price: 2000,
    shortDescription: "Teclado compacto silencioso com atalhos multimédia.",
    specs: [{ label: "Ligação", value: "2,4 GHz USB" }, { label: "Layout", value: "PT" }],
    tags: ["teclado", "sem fio", "pc"],
  }),
  product({
    id: "p-033", slug: "combo-teclado-e-rato-sem-fio", name: "Combo teclado e rato sem fio",
    category: "informatica", brand: "ClickPro", price: 3000,
    shortDescription: "Conjunto teclado + rato com um único recetor USB.",
    specs: [{ label: "Inclui", value: "Teclado + rato" }, { label: "Ligação", value: "2,4 GHz USB" }],
    tags: ["combo", "teclado", "rato"],
    bestseller: true,
  }),
  product({
    id: "p-034", slug: "tapete-de-rato", name: "Tapete de rato",
    category: "informatica", brand: "ClickPro", price: 600,
    shortDescription: "Tapete de grande formato com base antiderrapante e bordas cosidas.",
    specs: [{ label: "Dimensões", value: "70 × 30 cm" }, { label: "Base", value: "Antiderrapante" }],
    tags: ["tapete", "mousepad", "pc"],
  }),
  product({
    id: "p-035", slug: "headset-gaming", name: "Headset gaming",
    category: "informatica", brand: "SoundPro", price: 3500,
    shortDescription: "Headset com som surround, microfone destacável e iluminação RGB.",
    specs: [{ label: "Ligação", value: "USB + jack 3,5 mm" }, { label: "Som", value: "Surround 7.1" }],
    tags: ["headset", "gaming", "audio"],
    bestseller: true, freeShipping: true,
  }),
  product({
    id: "p-036", slug: "webcam-full-hd", name: "Webcam Full HD",
    category: "informatica", brand: "ClickPro", price: 2800,
    shortDescription: "Webcam 1080p com microfone integrado e foco automático.",
    specs: [{ label: "Resolução", value: "1080p a 30 fps" }, { label: "Microfone", value: "Integrado" }],
    tags: ["webcam", "video", "pc"],
  }),
  product({
    id: "p-037", slug: "pen-drive-32-gb", name: "Pen drive 32 GB",
    category: "informatica", brand: "DataFast", price: 900,
    shortDescription: "Pen USB 3.0 rápida e resistente para levar os seus ficheiros.",
    specs: [{ label: "Capacidade", value: "32 GB" }, { label: "Interface", value: "USB 3.0" }],
    tags: ["pen drive", "armazenamento", "usb"],
  }),
  product({
    id: "p-038", slug: "pen-drive-64-gb", name: "Pen drive 64 GB",
    category: "informatica", brand: "DataFast", price: 1200,
    shortDescription: "Pen USB 3.0 com tampão retrátil e leitura até 100 MB/s.",
    specs: [{ label: "Capacidade", value: "64 GB" }, { label: "Velocidade", value: "100 MB/s" }],
    tags: ["pen drive", "armazenamento", "usb"],
  }),
  product({
    id: "p-039", slug: "pen-drive-128-gb", name: "Pen drive 128 GB",
    category: "informatica", brand: "DataFast", price: 1800,
    shortDescription: "Muito espaço num formato compacto, com USB 3.0.",
    specs: [{ label: "Capacidade", value: "128 GB" }, { label: "Interface", value: "USB 3.0" }],
    tags: ["pen drive", "armazenamento", "usb"],
    bestseller: true,
  }),
  product({
    id: "p-040", slug: "ssd-256-gb", name: "SSD 256 GB",
    category: "informatica", brand: "DataFast", price: 3500,
    shortDescription: "Disco de estado sólido SATA que deixa o computador muito mais rápido.",
    specs: [{ label: "Capacidade", value: "256 GB" }, { label: "Interface", value: "SATA III" }],
    tags: ["ssd", "armazenamento", "pc"],
  }),
  product({
    id: "p-041", slug: "ssd-512-gb", name: "SSD 512 GB",
    category: "informatica", brand: "DataFast", price: 6000,
    shortDescription: "SSD SATA de 512 GB com arranque rápido e mais espaço.",
    specs: [{ label: "Capacidade", value: "512 GB" }, { label: "Interface", value: "SATA III" }],
    tags: ["ssd", "armazenamento", "pc"],
    featured: true,
  }),
  product({
    id: "p-042", slug: "disco-externo-1-tb", name: "Disco externo 1 TB",
    category: "informatica", brand: "DataFast", price: 7000,
    shortDescription: "Disco externo portátil USB 3.0 para cópias de segurança.",
    specs: [{ label: "Capacidade", value: "1 TB" }, { label: "Interface", value: "USB 3.0" }],
    tags: ["disco externo", "backup", "armazenamento"],
    freeShipping: true,
  }),
  product({
    id: "p-043", slug: "adaptador-wifi-usb", name: "Adaptador Wi-Fi USB",
    category: "informatica", brand: "NetLink", price: 1200,
    shortDescription: "Adiciona Wi-Fi dual-band ao seu computador por USB.",
    specs: [{ label: "Bandas", value: "2,4 + 5 GHz" }, { label: "Norma", value: "AC1200" }],
    tags: ["wifi", "adaptador", "rede"],
  }),
  product({
    id: "p-044", slug: "hub-usb-multiporta", name: "Hub USB multiporta",
    category: "informatica", brand: "NetLink", price: 1800,
    shortDescription: "Expande uma porta USB-C em HDMI, USB 3.0 e leitor de cartões.",
    specs: [{ label: "Portas", value: "HDMI + 3× USB + cartões" }, { label: "Ligação", value: "USB-C" }],
    tags: ["hub", "usb", "adaptador"],
  }),
  product({
    id: "p-045", slug: "cabo-hdmi", name: "Cabo HDMI",
    category: "informatica", brand: "NetLink", price: 900,
    shortDescription: "Cabo HDMI 2.0 de 2 metros com suporte a 4K.",
    specs: [{ label: "Comprimento", value: "2 m" }, { label: "Resolução", value: "4K a 60 Hz" }],
    tags: ["hdmi", "cabo", "video"],
  }),

  /* ── Casa ───────────────────────────────────────────────────── */
  product({
    id: "p-046", slug: "manta-de-sofa", name: "Manta de sofá",
    category: "casa", brand: "CasaNobre", price: 2000,
    shortDescription: "Manta macia e quente para sofá ou cama, em tom neutro.",
    specs: [{ label: "Dimensões", value: "150 × 200 cm" }, { label: "Material", value: "Polar" }],
    tags: ["manta", "sofa", "casa"],
  }),
  product({
    id: "p-047", slug: "jogo-de-lencois", name: "Jogo de lençóis",
    category: "casa", brand: "CasaNobre", price: 3500,
    shortDescription: "Jogo de lençóis de algodão macio com dois tamanhos disponíveis.",
    specs: [{ label: "Inclui", value: "Lençol + 2 fronhas" }, { label: "Material", value: "Algodão" }],
    tags: ["lencois", "cama", "casa"],
    variants: [{ type: "Tamanho", options: [{ name: "Casal" }, { name: "Queen" }] }],
  }),
  product({
    id: "p-048", slug: "almofada-decorativa", name: "Almofada decorativa",
    category: "casa", brand: "CasaNobre", price: 1000,
    shortDescription: "Almofada com capa removível e lavável para dar vida à sala.",
    specs: [{ label: "Dimensões", value: "45 × 45 cm" }, { label: "Capa", value: "Removível" }],
    tags: ["almofada", "decoracao", "casa"],
  }),
  product({
    id: "p-049", slug: "cortina-blackout", name: "Cortina blackout",
    category: "casa", brand: "CasaNobre", price: 2500,
    shortDescription: "Cortina que bloqueia a luz e o calor, com ilhós metálicos.",
    specs: [{ label: "Dimensões", value: "140 × 260 cm" }, { label: "Tecido", value: "Blackout" }],
    tags: ["cortina", "blackout", "casa"],
  }),
  product({
    id: "p-050", slug: "tapete-de-sala", name: "Tapete de sala",
    category: "casa", brand: "CasaNobre", price: 4000,
    shortDescription: "Tapete macio de pelo curto, fácil de limpar, para a sala.",
    specs: [{ label: "Dimensões", value: "160 × 230 cm" }, { label: "Material", value: "Polipropileno" }],
    tags: ["tapete", "sala", "decoracao"],
    featured: true,
  }),
  product({
    id: "p-051", slug: "organizador-de-cozinha", name: "Organizador de cozinha",
    category: "casa", brand: "CasaNobre", price: 800,
    shortDescription: "Organizador multiusos com prateleiras para arrumar a cozinha.",
    specs: [{ label: "Material", value: "PP resistente" }, { label: "Níveis", value: "2" }],
    tags: ["organizador", "cozinha", "arrumacao"],
  }),
  product({
    id: "p-052", slug: "organizador-de-gaveta", name: "Organizador de gaveta",
    category: "casa", brand: "CasaNobre", price: 700,
    shortDescription: "Divisórias ajustáveis que mantêm as gavetas sempre arrumadas.",
    specs: [{ label: "Material", value: "Plástico rígido" }, { label: "Divisórias", value: "Ajustáveis" }],
    tags: ["organizador", "gaveta", "arrumacao"],
  }),
  product({
    id: "p-053", slug: "conjunto-de-garrafas-hermeticas", name: "Conjunto de garrafas herméticas",
    category: "casa", brand: "CasaNobre", price: 1200,
    shortDescription: "Conjunto de garrafas herméticas ideais para conservar alimentos.",
    specs: [{ label: "Peças", value: "4" }, { label: "Vedação", value: "Hermética" }],
    tags: ["garrafa", "cozinha", "armazenamento"],
  }),
  product({
    id: "p-054", slug: "frigideira-antiaderente", name: "Frigideira antiaderente",
    category: "casa", brand: "Cozinhalux", price: 1800,
    shortDescription: "Frigideira antiaderente de 28 cm, poupa óleo e é fácil de lavar.",
    specs: [{ label: "Diâmetro", value: "28 cm" }, { label: "Revestimento", value: "Antiaderente" }],
    tags: ["frigideira", "cozinha", "antiaderente"],
  }),
  product({
    id: "p-055", slug: "panela-de-pressao", name: "Panela de pressão",
    category: "casa", brand: "Cozinhalux", price: 3500,
    shortDescription: "Panela de pressão de 6 L com válvula de segurança dupla.",
    specs: [{ label: "Capacidade", value: "6 L" }, { label: "Segurança", value: "Válvula dupla" }],
    tags: ["panela", "pressao", "cozinha"],
    bestseller: true, dealOfDay: true,
  }),
  product({
    id: "p-056", slug: "liquidificador", name: "Liquidificador",
    category: "casa", brand: "Cozinhalux", price: 4500,
    shortDescription: "Liquidificador de 1,5 L com 2 velocidades e jarro de vidro.",
    specs: [{ label: "Capacidade", value: "1,5 L" }, { label: "Potência", value: "400W" }],
    tags: ["liquidificador", "cozinha", "eletrodomestico"],
    featured: true, freeShipping: true,
  }),
  product({
    id: "p-057", slug: "lampadas-led-pack", name: "Lâmpadas LED (pack de 4)",
    category: "casa", brand: "LumiFlex", price: 900,
    shortDescription: "Pack de 4 lâmpadas LED de baixo consumo e luz branca.",
    specs: [{ label: "Pack", value: "4 lâmpadas" }, { label: "Potência", value: "9W · 6500K" }],
    tags: ["lampada", "led", "casa"],
  }),
  product({
    id: "p-058", slug: "lampada-led-inteligente", name: "Lâmpada LED inteligente",
    category: "casa", brand: "LumiFlex", price: 1200,
    shortDescription: "Lâmpada Wi-Fi com cores ajustáveis e controlo por app.",
    specs: [{ label: "Ligação", value: "Wi-Fi" }, { label: "Cores", value: "16 milhões (RGB)" }],
    tags: ["lampada", "inteligente", "wifi"],
    isNew: true,
  }),
  product({
    id: "p-059", slug: "relogio-de-parede", name: "Relógio de parede",
    category: "casa", brand: "CasaNobre", price: 1000,
    shortDescription: "Relógio de parede silencioso com design minimalista.",
    specs: [{ label: "Diâmetro", value: "30 cm" }, { label: "Ponteiros", value: "Silenciosos" }],
    tags: ["relogio", "parede", "decoracao"],
  }),
  product({
    id: "p-060", slug: "jogo-de-panelas", name: "Jogo de panelas",
    category: "casa", brand: "Cozinhalux", price: 6000,
    shortDescription: "Conjunto de panelas antiaderentes com tampas de vidro.",
    specs: [{ label: "Peças", value: "5" }, { label: "Revestimento", value: "Antiaderente" }],
    tags: ["panelas", "cozinha", "antiaderente"],
    freeShipping: true,
  }),

  /* ── Moda ───────────────────────────────────────────────────── */
  product({
    id: "p-061", slug: "t-shirt-basica", name: "T-shirt básica",
    category: "moda", brand: "NorteWear", price: 900,
    shortDescription: "T-shirt de algodão confortável, perfeita para o dia a dia.",
    specs: [{ label: "Material", value: "100% algodão" }, { label: "Corte", value: "Regular" }],
    tags: ["tshirt", "camiseta", "algodao"],
    bestseller: true,
    variants: [
      { type: "Tamanho", options: [{ name: "S" }, { name: "M" }, { name: "L" }, { name: "XL" }] },
      { type: "Cor", options: [{ name: "Preto", hex: "#111827" }, { name: "Branco", hex: "#f8fafc" }, { name: "Azul", hex: "#1d4ed8" }] },
    ],
  }),
  product({
    id: "p-062", slug: "camisa-casual", name: "Camisa casual",
    category: "moda", brand: "NorteWear", price: 1500,
    shortDescription: "Camisa casual de manga curta, leve e fácil de combinar.",
    specs: [{ label: "Material", value: "Algodão misto" }, { label: "Manga", value: "Curta" }],
    tags: ["camisa", "casual", "moda"],
    variants: [{ type: "Tamanho", options: [{ name: "S" }, { name: "M" }, { name: "L" }, { name: "XL" }] }],
  }),
  product({
    id: "p-063", slug: "calcas-de-ganga", name: "Calças de ganga",
    category: "moda", brand: "NorteWear", price: 2500,
    shortDescription: "Calças de ganga de corte clássico, resistentes e confortáveis.",
    specs: [{ label: "Material", value: "Ganga" }, { label: "Corte", value: "Slim" }],
    tags: ["calcas", "ganga", "jeans"],
    variants: [{ type: "Tamanho", options: [{ name: "30" }, { name: "32" }, { name: "34" }, { name: "36" }] }],
  }),
  product({
    id: "p-064", slug: "vestido-casual", name: "Vestido casual",
    category: "moda", brand: "NorteWear", price: 2500,
    shortDescription: "Vestido leve e fluido, ideal para o clima quente.",
    specs: [{ label: "Material", value: "Viscose" }, { label: "Comprimento", value: "Midi" }],
    tags: ["vestido", "casual", "feminino"],
  }),
  product({
    id: "p-065", slug: "blusa-feminina", name: "Blusa feminina",
    category: "moda", brand: "NorteWear", price: 1600,
    shortDescription: "Blusa elegante e versátil, para o trabalho ou o fim de semana.",
    specs: [{ label: "Material", value: "Poliéster" }, { label: "Corte", value: "Solto" }],
    tags: ["blusa", "feminino", "moda"],
  }),
  product({
    id: "p-066", slug: "jaqueta", name: "Jaqueta",
    category: "moda", brand: "NorteWear", price: 3500,
    shortDescription: "Jaqueta com forro interior e fecho de correr em metal.",
    specs: [{ label: "Material", value: "Poliéster reforçado" }, { label: "Forro", value: "Interior" }],
    tags: ["jaqueta", "casaco", "moda"],
    freeShipping: true,
  }),
  product({
    id: "p-067", slug: "sweatshirt-com-capuz", name: "Sweatshirt com capuz",
    category: "moda", brand: "NorteWear", price: 2200,
    shortDescription: "Sweatshirt com capuz e bolso canguru, quente e macio.",
    specs: [{ label: "Material", value: "Algodão misto" }, { label: "Capuz", value: "Ajustável" }],
    tags: ["sweatshirt", "capuz", "moda"],
  }),
  product({
    id: "p-068", slug: "sapatilhas-desportivas", name: "Sapatilhas desportivas",
    category: "moda", brand: "PassoLeve", price: 3500,
    shortDescription: "Sapatilhas leves com sola amortecida para o treino e o dia a dia.",
    specs: [{ label: "Material", value: "Malha respirável" }, { label: "Sola", value: "EVA amortecida" }],
    tags: ["sapatilhas", "tenis", "desporto"],
    bestseller: true, freeShipping: true,
    variants: [
      { type: "Tamanho", options: [{ name: "39" }, { name: "40" }, { name: "41" }, { name: "42" }, { name: "43" }] },
      { type: "Cor", options: [{ name: "Preto", hex: "#111827" }, { name: "Branco", hex: "#f8fafc" }] },
    ],
  }),
  product({
    id: "p-069", slug: "sandalias", name: "Sandálias",
    category: "moda", brand: "PassoLeve", price: 1800,
    shortDescription: "Sandálias confortáveis com tira ajustável no calcanhar.",
    specs: [{ label: "Material", value: "Sintético" }, { label: "Sola", value: "Antiderrapante" }],
    tags: ["sandalias", "calcado", "verao"],
    variants: [{ type: "Tamanho", options: [{ name: "38" }, { name: "39" }, { name: "40" }, { name: "41" }, { name: "42" }] }],
  }),
  product({
    id: "p-070", slug: "sapatos-sociais", name: "Sapatos sociais",
    category: "moda", brand: "PassoLeve", price: 3000,
    shortDescription: "Sapatos sociais clássicos em pele sintética, ideais para o trabalho.",
    specs: [{ label: "Material", value: "Pele sintética" }, { label: "Estilo", value: "Clássico" }],
    tags: ["sapatos", "social", "calcado"],
    variants: [{ type: "Tamanho", options: [{ name: "39" }, { name: "40" }, { name: "41" }, { name: "42" }, { name: "43" }] }],
  }),
  product({
    id: "p-071", slug: "chinelos", name: "Chinelos",
    category: "moda", brand: "PassoLeve", price: 800,
    shortDescription: "Chinelos leves e macios, perfeitos para casa ou a praia.",
    specs: [{ label: "Material", value: "EVA" }, { label: "Sola", value: "Antiderrapante" }],
    tags: ["chinelos", "praia", "calcado"],
    variants: [{ type: "Tamanho", options: [{ name: "38" }, { name: "40" }, { name: "42" }, { name: "44" }] }],
  }),
  product({
    id: "p-072", slug: "cinto-de-couro", name: "Cinto de couro",
    category: "moda", brand: "NorteWear", price: 1000,
    shortDescription: "Cinto de couro com fivela em metal, para todos os dias.",
    specs: [{ label: "Material", value: "Couro" }, { label: "Fivela", value: "Metal" }],
    tags: ["cinto", "couro", "acessorio"],
  }),
  product({
    id: "p-073", slug: "fato-de-treino", name: "Fato de treino",
    category: "moda", brand: "PassoLeve", price: 3500,
    shortDescription: "Conjunto de treino de duas peças, leve e respirável.",
    specs: [{ label: "Inclui", value: "Casaco + calças" }, { label: "Material", value: "Poliéster" }],
    tags: ["fato de treino", "desporto", "conjunto"],
  }),
  product({
    id: "p-074", slug: "pijama", name: "Pijama",
    category: "moda", brand: "NorteWear", price: 1800,
    shortDescription: "Pijama de algodão macio para noites confortáveis.",
    specs: [{ label: "Inclui", value: "Camisa + calças" }, { label: "Material", value: "Algodão" }],
    tags: ["pijama", "noite", "conforto"],
  }),
  product({
    id: "p-075", slug: "meias-pack-de-5", name: "Meias (pack de 5)",
    category: "moda", brand: "NorteWear", price: 400,
    shortDescription: "Pack de 5 pares de meias de algodão para o dia a dia.",
    specs: [{ label: "Pack", value: "5 pares" }, { label: "Material", value: "Algodão" }],
    tags: ["meias", "pack", "algodao"],
  }),

  /* ── Beleza ─────────────────────────────────────────────────── */
  product({
    id: "p-076", slug: "perfume-feminino", name: "Perfume feminino",
    category: "beleza", brand: "AromaMoz", price: 4000,
    shortDescription: "Fragrância floral duradoura, ideal para o dia e a noite.",
    specs: [{ label: "Volume", value: "100 ml" }, { label: "Família", value: "Floral" }],
    tags: ["perfume", "feminino", "fragrancia"],
    featured: true, freeShipping: true,
  }),
  product({
    id: "p-077", slug: "perfume-masculino", name: "Perfume masculino",
    category: "beleza", brand: "AromaMoz", price: 4000,
    shortDescription: "Fragrância amadeirada marcante com boa fixação.",
    specs: [{ label: "Volume", value: "100 ml" }, { label: "Família", value: "Amadeirada" }],
    tags: ["perfume", "masculino", "fragrancia"],
    freeShipping: true,
  }),
  product({
    id: "p-078", slug: "serum-facial-de-vitamina-c", name: "Sérum facial de vitamina C",
    category: "beleza", brand: "DermaGlow", price: 2000,
    shortDescription: "Sérum antioxidante que ilumina e uniformiza o tom da pele.",
    specs: [{ label: "Volume", value: "30 ml" }, { label: "Ativo", value: "Vitamina C 10%" }],
    tags: ["serum", "vitamina c", "skincare"],
    isNew: true,
  }),
  product({
    id: "p-079", slug: "creme-hidratante", name: "Creme hidratante",
    category: "beleza", brand: "DermaGlow", price: 1200,
    shortDescription: "Hidratação profunda para pele seca, com absorção rápida.",
    specs: [{ label: "Volume", value: "200 ml" }, { label: "Tipo de pele", value: "Seca / normal" }],
    tags: ["creme", "hidratante", "skincare"],
  }),
  product({
    id: "p-080", slug: "protetor-solar", name: "Protetor solar",
    category: "beleza", brand: "DermaGlow", price: 1500,
    shortDescription: "Proteção SPF 50 contra os raios UVA e UVB, sem deixar resíduo.",
    specs: [{ label: "FPS", value: "50" }, { label: "Volume", value: "120 ml" }],
    tags: ["protetor solar", "spf", "skincare"],
    bestseller: true,
  }),
  product({
    id: "p-081", slug: "batom-liquido", name: "Batom líquido",
    category: "beleza", brand: "DermaGlow", price: 800,
    shortDescription: "Batom líquido matte de longa duração, não transfere.",
    specs: [{ label: "Acabamento", value: "Matte" }, { label: "Duração", value: "até 8 h" }],
    tags: ["batom", "maquilhagem", "labial"],
    variants: [{ type: "Cor", options: [{ name: "Nude", hex: "#c08457" }, { name: "Vermelho", hex: "#b91c1c" }, { name: "Rosa", hex: "#db2777" }] }],
  }),
  product({
    id: "p-082", slug: "base-de-maquilhagem", name: "Base de maquilhagem",
    category: "beleza", brand: "DermaGlow", price: 1500,
    shortDescription: "Base de cobertura média com acabamento natural e leve.",
    specs: [{ label: "Volume", value: "30 ml" }, { label: "Cobertura", value: "Média" }],
    tags: ["base", "maquilhagem", "pele"],
  }),
  product({
    id: "p-083", slug: "mascara-de-cilios", name: "Máscara de cílios",
    category: "beleza", brand: "DermaGlow", price: 900,
    shortDescription: "Máscara que alonga e separa os cílios sem grumos.",
    specs: [{ label: "Efeito", value: "Alongador" }, { label: "Resistência", value: "À prova de água" }],
    tags: ["mascara", "cilios", "maquilhagem"],
  }),
  product({
    id: "p-084", slug: "secador-de-cabelo", name: "Secador de cabelo",
    category: "beleza", brand: "AromaMoz", price: 3000,
    shortDescription: "Secador potente com 3 temperaturas e difusor incluído.",
    specs: [{ label: "Potência", value: "2000W" }, { label: "Acessórios", value: "Difusor + concentrador" }],
    tags: ["secador", "cabelo", "beleza"],
  }),
  product({
    id: "p-085", slug: "prancheta-para-cabelo", name: "Prancheta para cabelo",
    category: "beleza", brand: "AromaMoz", price: 2800,
    shortDescription: "Prancheta com placas cerâmicas e aquecimento rápido.",
    specs: [{ label: "Placas", value: "Cerâmica" }, { label: "Temperatura", value: "até 230 °C" }],
    tags: ["prancheta", "cabelo", "beleza"],
  }),

  /* ── Acessórios ─────────────────────────────────────────────── */
  product({
    id: "p-086", slug: "relogio-de-pulso", name: "Relógio de pulso",
    category: "acessorios", brand: "TempoFino", price: 5000,
    shortDescription: "Relógio analógico com bracelete metálico e vidro mineral.",
    specs: [{ label: "Movimento", value: "Quartzo" }, { label: "Resistência", value: "3 ATM" }],
    tags: ["relogio", "pulso", "acessorio"],
    featured: true, freeShipping: true,
  }),
  product({
    id: "p-087", slug: "oculos-de-sol", name: "Óculos de sol",
    category: "acessorios", brand: "TempoFino", price: 1500,
    shortDescription: "Óculos de sol com proteção UV400 e armação leve.",
    specs: [{ label: "Proteção", value: "UV400" }, { label: "Armação", value: "Policarbonato" }],
    tags: ["oculos", "sol", "acessorio"],
  }),
  product({
    id: "p-088", slug: "mochila-para-portatil", name: "Mochila para portátil",
    category: "acessorios", brand: "ViajaBem", price: 3000,
    shortDescription: "Mochila com compartimento acolchoado até 15,6\" e porta USB.",
    specs: [{ label: "Portátil", value: "até 15,6\"" }, { label: "Porta USB", value: "Sim" }],
    tags: ["mochila", "portatil", "viagem"],
    bestseller: true,
  }),
  product({
    id: "p-089", slug: "bolsa-de-mao", name: "Bolsa de mão",
    category: "acessorios", brand: "ViajaBem", price: 2500,
    shortDescription: "Bolsa elegante com alça removível e vários compartimentos.",
    specs: [{ label: "Material", value: "Sintético" }, { label: "Alça", value: "Removível" }],
    tags: ["bolsa", "mao", "feminino"],
  }),
  product({
    id: "p-090", slug: "carteira-de-couro", name: "Carteira de couro",
    category: "acessorios", brand: "ViajaBem", price: 1200,
    shortDescription: "Carteira compacta de couro com vários compartimentos.",
    specs: [{ label: "Material", value: "Couro" }, { label: "Compartimentos", value: "6" }],
    tags: ["carteira", "couro", "acessorio"],
  }),
  product({
    id: "p-091", slug: "colar", name: "Colar",
    category: "acessorios", brand: "TempoFino", price: 800,
    shortDescription: "Colar delicado com acabamento dourado, para uso diário.",
    specs: [{ label: "Material", value: "Aço inox banhado" }, { label: "Comprimento", value: "45 cm" }],
    tags: ["colar", "bijuteria", "acessorio"],
  }),
  product({
    id: "p-092", slug: "pulseira", name: "Pulseira",
    category: "acessorios", brand: "TempoFino", price: 600,
    shortDescription: "Pulseira ajustável com detalhe minimalista.",
    specs: [{ label: "Material", value: "Aço inox" }, { label: "Ajuste", value: "Extensor" }],
    tags: ["pulseira", "bijuteria", "acessorio"],
  }),
  product({
    id: "p-093", slug: "brincos", name: "Brincos",
    category: "acessorios", brand: "TempoFino", price: 700,
    shortDescription: "Conjunto de brincos leves, ideais para o dia a dia.",
    specs: [{ label: "Material", value: "Liga metálica" }, { label: "Peças", value: "3 pares" }],
    tags: ["brincos", "bijuteria", "acessorio"],
  }),
  product({
    id: "p-094", slug: "anel", name: "Anel",
    category: "acessorios", brand: "TempoFino", price: 700,
    shortDescription: "Anel de design moderno com acabamento polido.",
    specs: [{ label: "Material", value: "Aço inox" }, { label: "Tamanhos", value: "Ajustável" }],
    tags: ["anel", "bijuteria", "acessorio"],
  }),
  product({
    id: "p-095", slug: "bone", name: "Boné",
    category: "acessorios", brand: "NorteWear", price: 800,
    shortDescription: "Boné com fecho ajustável e aba curva.",
    specs: [{ label: "Material", value: "Algodão" }, { label: "Fecho", value: "Ajustável" }],
    tags: ["bone", "chapeu", "acessorio"],
  }),
  product({
    id: "p-096", slug: "chapeu", name: "Chapéu",
    category: "acessorios", brand: "NorteWear", price: 900,
    shortDescription: "Chapéu de aba larga que protege do sol com estilo.",
    specs: [{ label: "Material", value: "Palha" }, { label: "Aba", value: "Larga" }],
    tags: ["chapeu", "sol", "acessorio"],
  }),
  product({
    id: "p-097", slug: "guarda-chuva", name: "Guarda-chuva",
    category: "acessorios", brand: "ViajaBem", price: 700,
    shortDescription: "Guarda-chuva reforçado, resistente ao vento e fácil de fechar.",
    specs: [{ label: "Diâmetro", value: "105 cm" }, { label: "Hastes", value: "8 reforçadas" }],
    tags: ["guarda chuva", "chuva", "acessorio"],
  }),
  product({
    id: "p-098", slug: "necessaire-de-viagem", name: "Necessaire de viagem",
    category: "acessorios", brand: "ViajaBem", price: 600,
    shortDescription: "Necessaire impermeável com elásticos para organizar tudo.",
    specs: [{ label: "Material", value: "Impermeável" }, { label: "Compartimentos", value: "2" }],
    tags: ["necessaire", "viagem", "organizador"],
  }),
  product({
    id: "p-099", slug: "chaveiro", name: "Chaveiro",
    category: "acessorios", brand: "ViajaBem", price: 300,
    shortDescription: "Chaveiro resistente com mosquetão em metal.",
    specs: [{ label: "Material", value: "Metal + couro" }, { label: "Mosquetão", value: "Sim" }],
    tags: ["chaveiro", "acessorio", "chaves"],
  }),
  product({
    id: "p-100", slug: "porta-cartoes", name: "Porta-cartões",
    category: "acessorios", brand: "ViajaBem", price: 1000,
    shortDescription: "Porta-cartões slim que protege contra leitura sem contacto.",
    specs: [{ label: "Capacidade", value: "6 cartões" }, { label: "Bloqueio RFID", value: "Sim" }],
    tags: ["porta cartoes", "carteira", "acessorio"],
  }),
];

/* ── Índices derivados ─────────────────────────────────────────── */
export const dealsOfToday = products.filter((p) => p.dealOfDay);
export const featuredProducts = products.filter((p) => p.featured);
export const bestsellers = products.filter((p) => p.bestseller);
export const newArrivals = products.filter((p) => p.isNew);

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getProductsByCategory(categorySlug: string): Product[] {
  return products.filter((p) => p.category === categorySlug);
}

export function searchProducts(query: string): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return products.filter((p) => {
    const haystack = [
      p.name,
      p.brand ?? "",
      p.shortDescription,
      ...p.tags,
      ...p.specs.map((s) => `${s.label} ${s.value}`),
    ]
      .join(" ")
      .toLowerCase();
    return q.split(/\s+/).every((word) => haystack.includes(word));
  });
}

/** Recomendações: produtos da mesma categoria ou com tags em comum. */
export function getRelatedProducts(product: Product, limit = 8): Product[] {
  const sameCategory = products.filter(
    (p) => p.category === product.category && p.id !== product.id,
  );
  const byTags = products
    .filter(
      (p) =>
        p.id !== product.id &&
        p.category !== product.category &&
        p.tags.some((t) => product.tags.includes(t)),
    )
    .sort((a, b) => b.sold - a.sold);
  return [...sameCategory, ...byTags].slice(0, limit);
}
