import { describe, expect, it } from "vitest";
import { discountPct, formatCompact, formatDate, formatMZN, groupByISOWeek, isoWeekNumber } from "./format";

describe("formatMZN", () => {
  it("formata valores inteiros em Metical", () => {
    expect(formatMZN(15900)).toBe("15.900 MT");
  });

  it("arredonda decimais para metical inteiro", () => {
    expect(formatMZN(1234.56)).toBe("1235 MT");
    expect(formatMZN(12345.6)).toBe("12.346 MT");
  });

  it("lida com zero", () => {
    expect(formatMZN(0)).toBe("0 MT");
  });
});

describe("formatCompact", () => {
  it("abrevia milhares e milhões", () => {
    expect(formatCompact(1_500)).toBe("1,5 mil");
    expect(formatCompact(12_000)).toBe("12 mil");
    expect(formatCompact(2_500_000)).toBe("2,5 mi");
  });

  it("devolve o número sem abreviar para valores pequenos", () => {
    expect(formatCompact(950)).toBe("950");
  });
});

describe("discountPct", () => {
  it("calcula a percentagem de desconto", () => {
    expect(discountPct(2000, 1500)).toBe(25);
  });

  it("devolve 0 sem desconto real", () => {
    expect(discountPct(1500, 1500)).toBe(0);
    expect(discountPct(1000, 1200)).toBe(0);
    expect(discountPct(0, 100)).toBe(0);
  });
});

describe("formatDate", () => {
  it("formata datas ISO no estilo pt-MZ com o ano", () => {
    const out = formatDate("2026-08-17T10:00:00Z");
    expect(out).toContain("2026");
    expect(out).toContain("17");
  });
});

describe("isoWeekNumber", () => {
  it("4 de janeiro de 2026 é a semana 1", () => {
    expect(isoWeekNumber(new Date("2026-01-04T12:00:00Z"))).toBe(1);
  });

  it("1 de setembro de 2026 (terça) cai na semana 36", () => {
    expect(isoWeekNumber(new Date("2026-09-01T12:00:00Z"))).toBe(36);
  });
});

describe("groupByISOWeek", () => {
  it("agrupa pedidos da mesma semana e ordena da mais recente para a mais antiga", () => {
    const orders = [
      { id: "a", date: "2026-09-01T10:00:00Z" }, // semana 36
      { id: "b", date: "2026-08-31T10:00:00Z" }, // segunda-feira da mesma semana 36
      { id: "c", date: "2026-08-20T10:00:00Z" }, // semana 34
    ];
    const groups = groupByISOWeek(orders, (o) => o.date);
    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe("2026-W36");
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].key).toBe("2026-W34");
  });

  it("a semana começa na segunda-feira", () => {
    const orders = [{ id: "a", date: "2026-08-30T23:00:00Z" }]; // domingo
    const [g] = groupByISOWeek(orders, (o) => o.date);
    const day = new Date(g.start).getUTCDay();
    expect(day === 1 || g.start.getDay() === 1).toBe(true);
  });

  it("ignora datas inválidas", () => {
    expect(groupByISOWeek([{ id: "x", date: "não é data" }], (o) => o.date)).toHaveLength(0);
  });
});
