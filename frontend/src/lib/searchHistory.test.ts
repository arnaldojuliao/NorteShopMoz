import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addSearchTerm,
  clearSearchHistory,
  getSearchHistory,
  removeSearchTerm,
} from "./searchHistory";

/**
 * O ambiente de testes é node (sem jsdom); o histórico usa localStorage
 * diretamente, por isso montamos um stub mínimo com a mesma interface.
 * `failing` simula armazenamento bloqueado (modo privado/quota).
 */
const store = new Map<string, string>();
const failing = { value: false };

const localStorageStub = {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => {
    if (failing.value) throw new Error("QuotaExceededError");
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => store.clear(),
};

// O módulo acede via `window.localStorage`, por isso fazemos stub dos dois.
vi.stubGlobal("localStorage", localStorageStub);
vi.stubGlobal("window", { localStorage: localStorageStub });

describe("searchHistory", () => {
  beforeEach(() => {
    store.clear();
    failing.value = false;
  });

  afterEach(() => {
    store.clear();
    failing.value = false;
  });

  it("começa vazio", () => {
    expect(getSearchHistory()).toEqual([]);
  });

  it("guarda termos com o mais recente em cima", () => {
    addSearchTerm("smartphone");
    addSearchTerm("TV LED");
    expect(getSearchHistory()).toEqual(["TV LED", "smartphone"]);
  });

  it("deduplica case-insensitive e traz a entrada existente para o topo", () => {
    addSearchTerm("Smartphone");
    addSearchTerm("TV LED");
    addSearchTerm("SMARTPHONE");
    expect(getSearchHistory()).toEqual(["SMARTPHONE", "TV LED"]);
  });

  it("ignora termos vazios ou só com espaços", () => {
    addSearchTerm("   ");
    addSearchTerm("");
    expect(getSearchHistory()).toEqual([]);
  });

  it("limita o histórico a 8 entradas, descartando as mais antigas", () => {
    for (let i = 1; i <= 10; i += 1) {
      addSearchTerm(`busca ${i}`);
    }
    const history = getSearchHistory();
    expect(history).toHaveLength(8);
    expect(history[0]).toBe("busca 10");
    expect(history).not.toContain("busca 1");
    expect(history).not.toContain("busca 2");
  });

  it("remove um termo específico", () => {
    addSearchTerm("smartphone");
    addSearchTerm("TV");
    removeSearchTerm("smartphone");
    expect(getSearchHistory()).toEqual(["TV"]);
  });

  it("remove é case-insensitive", () => {
    addSearchTerm("Smartphone");
    removeSearchTerm("SMARTPHONE");
    expect(getSearchHistory()).toEqual([]);
  });

  it("adicionar e remover toleram armazenamento bloqueado", () => {
    failing.value = true;
    expect(() => addSearchTerm("smartphone")).not.toThrow();
    expect(() => removeSearchTerm("smartphone")).not.toThrow();
    expect(() => clearSearchHistory()).not.toThrow();
  });

  it("leitura tolera JSON corrupto", () => {
    store.set("nsm:search-history", "{não é json");
    expect(getSearchHistory()).toEqual([]);
  });

  it("leitura ignora entradas não-string e limpa espaços", () => {
    store.set(
      "nsm:search-history",
      JSON.stringify(["ok", 42, null, "  com espaço  ", "ok"]),
    );
    expect(getSearchHistory()).toEqual(["ok", "com espaço"]);
  });

  it("clearSearchHistory limpa tudo", () => {
    addSearchTerm("a");
    addSearchTerm("b");
    clearSearchHistory();
    expect(getSearchHistory()).toEqual([]);
  });
});
