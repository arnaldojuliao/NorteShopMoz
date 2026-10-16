export type IconName =
  | "CheckCircle2"
  | "Shield"
  | "Lock"
  | "Truck"
  | "RotateCcw"
  | "MessageSquare"
  | "Coins"
  | "Package"
  | "Star"
  | "Headphones";

export interface PromotionMessage {
  id: string;
  icon: IconName;
  title: string;
  subtitle: string;
}

export const promotionMessages: PromotionMessage[] = [
  {
    id: "free-delivery",
    icon: "Truck",
    title: "Entrega grátis",
    subtitle: "Oferta por tempo limitado",
  },
  {
    id: "secure-payment",
    icon: "Lock",
    title: "Pagamento seguro",
    subtitle: "Proteção dos seus dados durante a compra",
  },
  {
    id: "delivery-guarantee",
    icon: "Shield",
    title: "Garantia de entrega",
    subtitle: "Apoio para a sua encomenda",
  },
  {
    id: "returns",
    icon: "RotateCcw",
    title: "Devoluções",
    subtitle: "Consulte os prazos e as condições aplicáveis",
  },
  {
    id: "customer-support",
    icon: "MessageSquare",
    title: "Apoio ao cliente",
    subtitle: "Estamos aqui para ajudar",
  },
];

export interface TrustBarContent {
  leftIcon: IconName;
  leftText: string;
  rightText: string;
  rightIcon: IconName;
  href: string;
}

export const trustBarContent: TrustBarContent = {
  leftIcon: "Shield",
  leftText: "Porquê escolher a NorteShopMoz?",
  rightText: "Privacidade protegida",
  rightIcon: "MessageSquare",
  href: "/sobre",
};