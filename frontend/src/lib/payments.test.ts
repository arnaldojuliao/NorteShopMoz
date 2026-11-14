import { afterEach, describe, expect, it, vi } from "vitest";
import { isProviderPaymentLink, paymentMethods } from "./payments";

describe("paymentMethods", () => {
  it("não oferece pagamento na entrega nem transferência bancária", () => {
    const names = paymentMethods.map((m) => m.name);

    expect(names).not.toContain("Pagamento na entrega");
    expect(names).not.toContain("Transferência bancária");
    expect(paymentMethods.every((m) => m.paidOnline)).toBe(true);
  });
});

/**
 * Só um link EXTERNO (checkout do provedor, ou o que o admin colou no pedido)
 * é aberto automaticamente e mostrado como «Pagar agora». Um URL da própria
 * loja não é a página do provedor — o cliente paga no link que o admin envia.
 */
describe("isProviderPaymentLink", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aceita o checkout da PaySuite (o link que o admin envia)", () => {
    vi.stubGlobal("window", { location: { host: "loja.mz", origin: "https://loja.mz" } });

    expect(
      isProviderPaymentLink("https://paysuite.tech/checkout/01m59hkmj6v7ejvmkzvwqce7z5"),
    ).toBe(true);
  });

  it("recusa qualquer endereço da própria loja", () => {
    vi.stubGlobal("window", { location: { host: "loja.mz", origin: "https://loja.mz" } });

    expect(isProviderPaymentLink("https://loja.mz/pedido/NSM-1")).toBe(false);
    // Relativo também resolve para o host da loja.
    expect(isProviderPaymentLink("/carrinho")).toBe(false);
  });

  it("recusa vazio, lixo e protocolos que não são http(s)", () => {
    vi.stubGlobal("window", { location: { host: "loja.mz", origin: "https://loja.mz" } });

    expect(isProviderPaymentLink(null)).toBe(false);
    expect(isProviderPaymentLink(undefined)).toBe(false);
    expect(isProviderPaymentLink("")).toBe(false);
    expect(isProviderPaymentLink("javascript:alert(1)")).toBe(false);
    expect(isProviderPaymentLink("nao e um url")).toBe(false);
  });

  it("sem `window` (SSR/testes) valida só o protocolo", () => {
    expect(isProviderPaymentLink("https://paysuite.tech/checkout/abc")).toBe(true);
    expect(isProviderPaymentLink("ftp://paysuite.tech/checkout/abc")).toBe(false);
  });
});
