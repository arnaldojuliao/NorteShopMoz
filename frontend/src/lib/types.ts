/* ────────────────────────────────────────────────────────────────
   NS · NorteShop — Domain types
   Estes tipos espelham o contrato REST que o backend Spring Boot
   deverá expor no futuro. A camada de dados (lib/repo) é o único
   ponto de troca entre dados locais e a API real.
   ──────────────────────────────────────────────────────────────── */

export type Badge = "NOVO" | "OFERTA" | "MAIS VENDIDO";

export interface VariantOption {
  name: string;
  hex?: string;
}

export interface ProductVariant {
  type: "Cor" | "Tamanho";
  options: VariantOption[];
}

export interface ProductSpec {
  label: string;
  value: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  brand?: string;
  category: string; // slug da categoria
  price: number; // Meticais
  oldPrice?: number;
  rating: number; // 0–5
  ratingCount: number;
  sold: number;
  stock: number;
  images: string[];
  shortDescription: string;
  description: string[];
  specs: ProductSpec[];
  badges: Badge[];
  featured?: boolean;
  bestseller?: boolean;
  isNew?: boolean;
  dealOfDay?: boolean;
  variants?: ProductVariant[];
  deliveryDays: [number, number];
  freeShipping?: boolean;
  tags: string[];
}

export interface Category {
  slug: string;
  name: string;
  emoji: string;
  image: string;
  description: string;
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  date: string;
  title: string;
  comment: string;
  verified: boolean;
}

export interface CartItem {
  productId: string;
  slug: string;
  name: string;
  image: string;
  price: number;
  oldPrice?: number;
  qty: number;
  variant?: string;
  freeShipping?: boolean;
}

export interface Province {
  name: string;
  fee: number;
  days: [number, number];
}

export type OrderStatus =
  | "Pedido recebido"
  | "Pagamento confirmado"
  | "Em preparação"
  | "Enviado"
  | "Em trânsito"
  | "Entregue";

export interface OrderItem {
  productId: string;
  slug: string;
  name: string;
  image: string;
  price: number;
  qty: number;
  variant?: string;
}

export interface OrderAddress {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  province: string;
  notes?: string;
}

export interface Order {
  id: string;
  date: string;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  status: OrderStatus;
  address: OrderAddress;
  paymentMethod: string;
  /** Referência da cobrança online (M-Pesa/e-Mola/cartão) — opcional. */
  paymentReference?: string;
}

export interface UserProfile {
  fullName: string;
  email: string;
  phone: string;
  /** Foto de perfil (data URL) — opcional. */
  avatar?: string;
}

export interface AddressBookEntry {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  isDefault: boolean;
  /** Coordenadas GPS (para o entregador) — opcional. */
  coords?: { lat: number; lng: number };
}

export interface PaymentMethod {
  id: string;
  name: string;
  description: string;
  available: boolean;
  badge?: string;
  /** Método pago online no checkout (M-Pesa/e-Mola/cartão) — exige dados extra. */
  paidOnline?: boolean;
  needsPhone?: boolean;
  needsCard?: boolean;
}
