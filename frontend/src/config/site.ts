/**
 * Configuração única da marca e canais de contacto.
 *
 * Todos os valores podem ser sobrepostos por variáveis de ambiente
 * (NEXT_PUBLIC_*), para não ser preciso alterar código ao mudar de
 * telefone/email/domínio. Os padrões abaixo são placeholders — substitua
 * pelas informações reais da loja no .env ou aqui.
 *
 * O acesso a `process.env.NEXT_PUBLIC_*` é **estático** (de propósito): só
 * assim o Next inlina o valor no bundle do browser — o acesso dinâmico
 * (`process.env[key]`) devolvia sempre o padrão nos componentes cliente
 * (Header/Footer mostravam o telefone placeholder). `envOr` trata a string
 * vazia como ausente (ver lib/env.ts).
 */

import { envOr } from "@/lib/env";

export const site = {
  /** Nome da loja. */
  name: "NorteShopMoz",
  nameFull: "NorteShopMoz",

  /** URL base pública (usado em SEO, sitemap, robots e JSON-LD). */
  url: envOr(process.env.NEXT_PUBLIC_SITE_URL, "https://norteshopmoz.com"),

  /** Telefone/WhatsApp de apoio (apenas dígitos, com indicativo). */
  phoneDigits: envOr(process.env.NEXT_PUBLIC_SUPPORT_PHONE, "258841234567").replace(/[^0-9]/g, ""),
  /** Telefone formatado para exibição. */
  phoneDisplay: envOr(process.env.NEXT_PUBLIC_SUPPORT_PHONE_DISPLAY, "+258 84 123 4567"),

  /** Emails institucionais. */
  email: envOr(process.env.NEXT_PUBLIC_SUPPORT_EMAIL, "apoio@norteshopmoz.com"),
  privacyEmail: envOr(process.env.NEXT_PUBLIC_PRIVACY_EMAIL, "privacidade@norteshopmoz.com"),

  /** Morada física. */
  addressLine1: "Av. 24 de Julho",
  addressCity: "Maputo",
  addressCountry: "Moçambique",

  /** Horário de atendimento. */
  hoursWeekdays: "Seg–Sex, 8h–18h",
  hoursSaturday: "Sábado, 8h–13h",

  /** Redes sociais (substituir pelos perfis oficiais quando existirem). */
  socials: {
    facebook: envOr(process.env.NEXT_PUBLIC_FACEBOOK_URL, "https://facebook.com"),
    instagram: envOr(process.env.NEXT_PUBLIC_INSTAGRAM_URL, "https://instagram.com"),
    x: envOr(process.env.NEXT_PUBLIC_X_URL, "https://x.com"),
  },
} as const;

/** Link tel:. */
export const telHref = `tel:+${site.phoneDigits}`;

/** Link wa.me com mensagem pré-preenchida opcional. */
export function whatsappHref(message?: string): string {
  const base = `https://wa.me/${site.phoneDigits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
