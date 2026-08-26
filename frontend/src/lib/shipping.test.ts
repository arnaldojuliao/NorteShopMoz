import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearApiCache } from "./api";
import { getShippingConfig, LOCAL_FREE_SHIPPING_THRESHOLD } from "./shipping";

describe("shipping config", () => {
  beforeEach(() => {
    // Limpa cache em memória e a janela de indisponibilidade entre testes.
    clearApiCache();
    vi.unstubAllGlobals();
  });

  it("usa o limite local de envio grátis (5.000 MT) quando a API está em baixo", async () => {
    expect(LOCAL_FREE_SHIPPING_THRESHOLD).toBe(5000);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const config = await getShippingConfig();
    expect(config.freeShippingThreshold).toBe(5000);
    expect(config.provinces.length).toBeGreaterThan(0);
    expect(config.provinces[0].name).toBeTruthy();
  });

  it("usa a config do servidor quando a API responde", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            freeShippingThreshold: 3000,
            provinces: [{ name: "Maputo Cidade", fee: 120, minDays: 1, maxDays: 3 }],
          },
        }),
      }),
    );

    const config = await getShippingConfig();
    expect(config.freeShippingThreshold).toBe(3000);
    expect(config.provinces).toHaveLength(1);
    expect(config.provinces[0].days).toEqual([1, 3]);
  });
});
