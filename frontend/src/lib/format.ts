/** Formata valores em Metical (MZN) no estilo "1.250 MT". */
export function formatMZN(value: number): string {
  const rounded = Math.round(value);
  const withDots = rounded.toLocaleString("pt-MZ").replace(/\s/g, ".");
  return `${withDots} MT`;
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(".", ",")} mil`;
  return String(value);
}

/** Percentagem de desconto entre preço antigo e atual. */
export function discountPct(oldPrice: number, price: number): number {
  if (!oldPrice || oldPrice <= price) return 0;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-MZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
