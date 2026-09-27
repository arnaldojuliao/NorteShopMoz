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

/* ── Agrupamento de pedidos por semana ISO ─────────────────────────── */

/** Número da semana ISO 8601 de uma data (1–53). */
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Segunda = 1 … Domingo = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Chave única da semana ISO: "2026-W36". */
export function isoWeekKey(iso: string): string {
  const d = new Date(iso);
  // Ajusta para a semana ISO correta quando a data cai em dom./seg. de viragem de ano.
  const dayNum = (d.getDay() + 6) % 7; // Segunda = 0 … Domingo = 6
  const thursday = new Date(d);
  thursday.setDate(d.getDate() + 3 - dayNum);
  const year = thursday.getFullYear();
  return `${year}-W${String(isoWeekNumber(d)).padStart(2, "0")}`;
}

/** Segunda-feira (00:00) da semana ISO a que a data pertence. */
export function startOfISOWeek(date: Date): Date {
  const d = new Date(date);
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum);
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface WeekGroup<T> {
  /** Chave ISO, ex.: "2026-W36". */
  key: string;
  /** Semana ISO (1–53). */
  week: number;
  /** Ano ISO. */
  year: number;
  /** Data (segunda-feira) de início da semana. */
  start: Date;
  /** Data (domingo) de fim da semana. */
  end: Date;
  /** Meses abrangidos pela semana (ex.: ["set", "out"]). */
  months: string[];
  items: T[];
}

/**
 * Agrupa itens com campo de data ISO por semana ISO 8601 (segunda a domingo),
 * por ordem cronológica decrescente (semana mais recente primeiro).
 */
export function groupByISOWeek<T>(items: T[], getDate: (item: T) => string): WeekGroup<T>[] {
  const groups = new Map<string, WeekGroup<T>>();
  for (const item of items) {
    const date = new Date(getDate(item));
    if (Number.isNaN(date.getTime())) continue;
    const key = isoWeekKey(getDate(item));
    let group = groups.get(key);
    if (!group) {
      const start = startOfISOWeek(date);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      const monthFmt = new Intl.DateTimeFormat("pt-MZ", { month: "short" });
      const months = [monthFmt.format(start)];
      const endMonth = monthFmt.format(end);
      if (endMonth !== months[0]) months.push(endMonth);
      group = {
        key,
        week: isoWeekNumber(date),
        year: start.getFullYear(),
        start,
        end,
        months,
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()].sort((a, b) => b.start.getTime() - a.start.getTime());
}
