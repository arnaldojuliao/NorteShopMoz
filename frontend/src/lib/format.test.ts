import { describe, expect, it } from "vitest";
import { discountPct, formatCompact, formatDate, formatMZN } from "./format";

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
