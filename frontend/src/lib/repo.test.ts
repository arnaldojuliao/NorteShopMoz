import { describe, expect, it } from "vitest";
import { filterLocalProducts, sortByNewest } from "./repo";
import { products as localProducts } from "./data/products";
import type { Product } from "./types";

/** Produto mínimo para testar a ordenação (só o que a regra usa). */
function product(id: string, createdAt?: string): Product {
  return {
    id,
    slug: id,
    name: id,
    category: "telemoveis",
    price: 100,
    rating: 0,
    ratingCount: 0,
    sold: 0,
    stock: 1,
    images: [],
    shortDescription: "",
    description: [],
    specs: [],
    badges: [],
    deliveryDays: [1, 2],
    tags: [],
    createdAt,
  };
}

describe("sortByNewest", () => {
  it("põe o último produto publicado em cima", () => {
    const list = [
      product("antigo", "2026-01-01T00:00:00Z"),
      product("recente", "2026-06-01T00:00:00Z"),
      product("meio", "2026-03-01T00:00:00Z"),
    ];

    expect(sortByNewest(list).map((p) => p.id)).toEqual(["recente", "meio", "antigo"]);
  });

  it("desempata carimbos iguais pelo id (como o backend)", () => {
    const list = [product("b", "2026-05-01T00:00:00Z"), product("a", "2026-05-01T00:00:00Z")];

    expect(sortByNewest(list).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("sem carimbos, mantém a ordem recebida (dados locais)", () => {
    const list = [product("p-001"), product("p-002"), product("p-003")];

    expect(sortByNewest(list).map((p) => p.id)).toEqual(["p-001", "p-002", "p-003"]);
  });

  it("com carimbos em falta (cache antiga), mantém a ordem da API", () => {
    const list = [
      product("novo", "2026-06-01T00:00:00Z"),
      product("sem-carimbo"),
      product("antigo", "2026-01-01T00:00:00Z"),
    ];

    expect(sortByNewest(list).map((p) => p.id)).toEqual(["novo", "sem-carimbo", "antigo"]);
  });
});

describe("filterLocalProducts", () => {
  it("ordena o fallback local do mais recente para o mais antigo", () => {
    // O ficheiro local está por ordem de antiguidade: o último produto do
    // ficheiro (o mais recente) passa a ser o primeiro da loja.
    const last = localProducts[localProducts.length - 1];
    const first = localProducts[0];

    const list = filterLocalProducts({});

    expect(list[0].id).toBe(last.id);
    expect(list[list.length - 1].id).toBe(first.id);
  });

  it("mantém a ordenação explícita do utilizador", () => {
    const list = filterLocalProducts({ sort: "price-asc" });
    const prices = list.map((p) => p.price);

    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("continua a filtrar por categoria", () => {
    const list = filterLocalProducts({ category: "telemoveis" });

    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p) => p.category === "telemoveis")).toBe(true);
  });
});
