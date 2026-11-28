import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Fallback de bases da API no servidor.
 *
 * Produção tinha `API_INTERNAL_BASE_URL` a apontar para um backend morto: o SSR
 * falhava, as páginas de produto faziam `notFound()` e o ISR congelava um 404,
 * enquanto o proxy same-origin (`API_PROXY_TARGET`) continuava a servir o
 * browser. O servidor tem de tentar o alvo do proxy antes de desistir.
 */
describe("fallback de bases da API no servidor", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("tenta o alvo do proxy quando a base interna falha", async () => {
    vi.stubEnv("API_INTERNAL_BASE_URL", "http://interno-morta:9");
    vi.stubEnv("API_PROXY_TARGET", "https://backend-vivo");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://publico");
    vi.resetModules();

    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        calls.push(String(url));
        if (String(url).startsWith("http://interno-morta:9")) throw new TypeError("fetch failed");
        return new Response(JSON.stringify({ data: { id: "p1" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const { apiGet } = await import("@/lib/api");
    const body = await apiGet<{ data: { id: string } }>("/api/products/p1", 0, true);

    expect(body.data.id).toBe("p1");
    expect(calls[0]).toContain("interno-morta");
    expect(calls[1]).toContain("backend-vivo");
    expect(calls).toHaveLength(2);
  });

  it("ignora o 404 de uma base morta (envelope do edge) e usa o proxy", async () => {
    vi.stubEnv("API_INTERNAL_BASE_URL", "http://interno-morta:9");
    vi.stubEnv("API_PROXY_TARGET", "https://backend-vivo");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://publico");
    vi.resetModules();

    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        calls.push(String(url));
        if (String(url).startsWith("http://interno-morta:9")) {
          return new Response(
            JSON.stringify({ status: "error", code: 404, message: "Application not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ data: { id: "p2" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const { apiGet } = await import("@/lib/api");
    const body = await apiGet<{ data: { id: string } }>("/api/products/p2", 0, true);

    expect(body.data.id).toBe("p2");
    expect(calls[1]).toContain("backend-vivo");
  });

  it("getProduct não transforma falha de API em 404", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("API_INTERNAL_BASE_URL", "");
    vi.stubEnv("API_PROXY_TARGET", "");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api");
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const { repo } = await import("@/lib/repo");
    await expect(repo.getProduct("capa-para-iphone")).rejects.toThrow();
  });

  it("getProduct devolve undefined apenas para um 404 real", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("API_INTERNAL_BASE_URL", "");
    vi.stubEnv("API_PROXY_TARGET", "");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api");
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Produto não encontrado" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const { repo } = await import("@/lib/repo");
    expect(await repo.getProduct("nao-existe")).toBeUndefined();
  });

  it("não repete pedidos que alteram estado (POST)", async () => {
    vi.stubEnv("API_INTERNAL_BASE_URL", "http://interno-morta:9");
    vi.stubEnv("API_PROXY_TARGET", "https://backend-vivo");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://publico");
    vi.resetModules();

    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        calls.push(String(url));
        throw new TypeError("fetch failed");
      }),
    );

    const { apiPost } = await import("@/lib/api");
    await expect(apiPost("/api/orders", {})).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});
