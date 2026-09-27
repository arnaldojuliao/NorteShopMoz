import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiPost, apiPut, clearApiCache, getCsrfToken, setCsrfToken } from "@/lib/api";

/**
 * CSRF no cliente.
 *
 * O cookie `nsm_csrf` é host-only: com a API num subdomínio o `document.cookie`
 * do frontend não o contém. Antes, o header `X-CSRF-Token` seguia vazio e o
 * backend respondia 403 a todos os pedidos autenticados que alteram estado.
 * Estes testes fixam a correção: o token vem do corpo do login/refresh ou do
 * endpoint `/api/auth/csrf`.
 */

const storage = new Map<string, string>();

/** Ambiente mínimo de browser (o Vitest aqui corre em Node, sem document/window). */
function stubBrowser(cookie = ""): void {
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
  });
  vi.stubGlobal("document", { cookie });
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** Valor do header X-CSRF-Token enviado numa dada chamada ao fetch. */
function csrfHeaderOf(call: unknown[] | undefined): string | undefined {
  const init = call?.[1] as { headers?: Record<string, string> } | undefined;
  return init?.headers?.["X-CSRF-Token"];
}

describe("CSRF no cliente", () => {
  beforeEach(() => {
    storage.clear();
    setCsrfToken(null);
    clearApiCache();
    stubBrowser(); // sem cookie legível (API noutro domínio)
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("usa o token devolvido pelo login nas escritas seguintes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { csrfToken: "tok-do-login", user: {} } }))
      .mockResolvedValueOnce(jsonResponse({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await apiPost("/api/auth/login", { email: "cliente@example.com", password: "Test@123" });
    await apiPut("/api/favorites", { productIds: ["p-1"] });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(csrfHeaderOf(fetchMock.mock.calls[1])).toBe("tok-do-login");
  });

  it("vai buscar o token a /api/auth/csrf quando não conhece nenhum", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { csrfToken: "tok-servidor" } }))
      .mockResolvedValueOnce(jsonResponse({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await apiPut("/api/cart", []);

    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/auth/csrf");
    expect(csrfHeaderOf(fetchMock.mock.calls[1])).toBe("tok-servidor");
    expect(getCsrfToken()).toBe("tok-servidor");
  });

  it("usa o cookie quando este é legível (mesmo domínio) sem pedido extra", async () => {
    stubBrowser("outro=1; nsm_csrf=token-do-cookie; mais=2");
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await apiPut("/api/cart", []);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(csrfHeaderOf(fetchMock.mock.calls[0])).toBe("token-do-cookie");
  });

  it("não pede token nos endpoints públicos de autenticação", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await apiPost("/api/auth/login", { email: "cliente@example.com", password: "Test@123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/auth/login");
  });

  it("esquece o token no logout", async () => {
    setCsrfToken("tok-antigo");
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await apiPost("/api/auth/logout", {});

    expect(getCsrfToken()).toBe("");
  });

  it("partilha o mesmo pedido de token em escritas concorrentes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { csrfToken: "tok-unico" } }))
      .mockResolvedValue(jsonResponse({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([apiPut("/api/cart", []), apiPut("/api/favorites", { productIds: [] })]);

    const csrfCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/api/auth/csrf"),
    );
    expect(csrfCalls).toHaveLength(1);
    expect(csrfHeaderOf(fetchMock.mock.calls[1])).toBe("tok-unico");
    expect(csrfHeaderOf(fetchMock.mock.calls[2])).toBe("tok-unico");
  });
});
