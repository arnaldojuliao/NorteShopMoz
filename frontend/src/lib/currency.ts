/**
 * Conversão e formatação de preços por moeda.
 *
 * Os preços do catálogo/pedidos são SEMPRE armazenados em Metical (MZN) —
 * a moeda escolhida nas configurações é apenas apresentação. As taxas são
 * fixas (referência editorial, não cotação em tempo real); atualize aqui
 * quando necessário.
 */

export type CurrencyCode = "MZN" | "USD" | "ZAR";

/** Quantos MZN vale 1 unidade da moeda (taxa de referência). */
export const RATES_IN_MZN: Record<CurrencyCode, number> = {
  MZN: 1,
  USD: 63.9,
  ZAR: 3.55,
};

/** Converte um valor em MZN para a moeda indicada. */
export function convertFromMZN(valueMzn: number, currency: CurrencyCode): number {
  if (currency === "MZN") return valueMzn;
  return valueMzn / RATES_IN_MZN[currency];
}

/**
 * Formata um valor JÁ NA MOEDA indicada — sem conversão.
 * MZN usa o estilo da loja ("1.250 MT"); as restantes usam Intl.
 */
export function formatMoney(value: number, currency: CurrencyCode): string {
  if (currency === "MZN") return formatMznRaw(value);
  try {
    return new Intl.NumberFormat("pt-MZ", {
      style: "currency",
      currency,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Formata um valor em MZN (base do catálogo) para a moeda escolhida. */
export function formatFromMZN(valueMzn: number, currency: CurrencyCode): string {
  const converted = Math.round(convertFromMZN(valueMzn, currency) * 100) / 100;
  return formatMoney(converted, currency);
}

function formatMznRaw(value: number): string {
  const rounded = Math.round(value);
  const withDots = rounded.toLocaleString("pt-MZ").replace(/\s/g, ".");
  return `${withDots} MT`;
}

export function isCurrencyCode(v: string): v is CurrencyCode {
  return v === "MZN" || v === "USD" || v === "ZAR";
}
