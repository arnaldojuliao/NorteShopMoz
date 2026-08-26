import { describe, expect, it } from "vitest";
import { convertFromMZN, formatFromMZN, formatMoney, isCurrencyCode } from "./currency";

describe("convertFromMZN", () => {
  it("não altera valores em MZN", () => {
    expect(convertFromMZN(1590, "MZN")).toBe(1590);
  });

  it("converte USD e ZAR dividindo pela taxa de referência", () => {
    expect(convertFromMZN(639, "USD")).toBeCloseTo(10, 5);
    expect(convertFromMZN(355, "ZAR")).toBeCloseTo(100, 5);
  });
});

describe("formatMoney", () => {
  it("formata MZN no estilo da loja (inteiro + MT)", () => {
    expect(formatMoney(15900, "MZN")).toBe("15.900 MT");
  });

  it("formata moedas estrangeiras com Intl", () => {
    const usd = formatMoney(10.5, "USD");
    expect(usd).toContain("10,50");
    expect(usd).toContain("US$");
    const zar = formatMoney(100, "ZAR");
    expect(zar).toContain("R");
  });
});

describe("formatFromMZN", () => {
  it("converte e formata a partir do valor base em MZN", () => {
    // 63.9 MZN → 10 USD
    expect(formatFromMZN(639, "USD")).toContain("10");
    expect(formatFromMZN(1590, "MZN")).toBe("1590 MT");
  });
});

describe("isCurrencyCode", () => {
  it("valida os códigos suportados", () => {
    expect(isCurrencyCode("MZN")).toBe(true);
    expect(isCurrencyCode("USD")).toBe(true);
    expect(isCurrencyCode("ZAR")).toBe(true);
    expect(isCurrencyCode("EUR")).toBe(false);
    expect(isCurrencyCode("")).toBe(false);
  });
});
