/**
 * Configuração única da marca e canais de contacto.
 *
 * Todos os valores podem ser sobrepostos por variáveis de ambiente
 * (NEXT_PUBLIC_*), para não ser preciso alterar código ao mudar de
 * telefone/email/domínio. Os padrões abaixo são placeholders — substitua
 * pelas informações reais da loja no .env ou aqui.
 */

const env = (key: string, fallback: string): string => process.env[key] ?? fallback;

export const site = {
  /** Nome da loja. */
  name: "NorteShop",
  nameFull: "NorteShopMoz",

  /** URL base pública (usado em SEO, sitemap, robots e JSON-LD). */
  url: env("NEXT_PUBLIC_SITE_URL", "https://norteshop.com"),

  /** Telefone/WhatsApp de apoio (apenas dígitos, com indicativo). */
  phoneDigits: env("NEXT_PUBLIC_SUPPORT_PHONE", "258841234567").replace(/[^0-9]/g, ""),
  /** Telefone formatado para exibição. */
  phoneDisplay: env("NEXT_PUBLIC_SUPPORT_PHONE_DISPLAY", "+258 84 123 4567"),

  /** Emails institucionais. */
  email: env("NEXT_PUBLIC_SUPPORT_EMAIL", "apoio@norteshop.com"),
  privacyEmail: env("NEXT_PUBLIC_PRIVACY_EMAIL", "privacidade@norteshop.com"),

  /** Morada física. */
  addressLine1: "Av. 24 de Julho",
  addressCity: "Maputo",
  addressCountry: "Moçambique",

  /** Horário de atendimento. */
  hoursWeekdays: "Seg–Sex, 8h–18h",
  hoursSaturday: "Sábado, 8h–13h",

  /** Redes sociais (substituir pelos perfis oficiais quando existirem). */
  socials: {
    facebook: env("NEXT_PUBLIC_FACEBOOK_URL", "https://facebook.com"),
    instagram: env("NEXT_PUBLIC_INSTAGRAM_URL", "https://instagram.com"),
    x: env("NEXT_PUBLIC_X_URL", "https://x.com"),
  },
} as const;

/** Link tel:. */
export const telHref = `tel:+${site.phoneDigits}`;

/** Link wa.me com mensagem pré-preenchida opcional. */
export function whatsappHref(message?: string): string {
  const base = `https://wa.me/${site.phoneDigits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
