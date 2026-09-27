import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * URL da API consoante o contexto.
 *
 * As chamadas que correm no servidor (route handlers, SSR) devem usar a URL
 * INTERNA (`http://api:8080` dentro do compose) e não o domínio público: usar o
 * público a partir do contentor obriga a resolver DNS e a sair e voltar pela
 * internet, e quando isso falha o catálogo cai em silêncio para dados locais.
 * No browser, continua a ser sempre a URL pública.
 */
describe("URL da API (servidor vs browser)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("usa a URL interna no servidor quando está definida", async () => {
    vi.stubEnv("API_INTERNAL_BASE_URL", "http://api:8080/");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.loja.mz");
    vi.resetModules();

    const { apiBaseUrl } = await import("@/lib/api");

    expect(apiBaseUrl()).toBe("http://api:8080");
  });

  it("cai para a URL pública quando a interna não está definida", async () => {
    vi.stubEnv("API_INTERNAL_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.loja.mz");
    vi.resetModules();

    const { apiBaseUrl } = await import("@/lib/api");

    expect(apiBaseUrl()).toBe("https://api.loja.mz");
  });

  it("no browser usa sempre a URL pública", async () => {
    vi.stubEnv("API_INTERNAL_BASE_URL", "http://api:8080");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.loja.mz");
    vi.resetModules();
    vi.stubGlobal("window", {});

    const { apiBaseUrl } = await import("@/lib/api");

    expect(apiBaseUrl()).toBe("https://api.loja.mz");
  });
});
