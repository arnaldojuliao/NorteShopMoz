import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/types";
import { discountOf, selectFlashDeals } from "./deals";

function makeProduct(over: Partial<Product> & { id: string }): Product {
  return {
    slug: over.id,
    name: over.id,
    category: "telemoveis",
    price: 1000,
    rating: 4.5,
    ratingCount: 10,
    sold: 10,
    stock: 40,
    images: [],
    shortDescription: "",
    description: [],
    specs: [],
    badges: ["OFERTA"],
    deliveryDays: [3, 7],
    tags: [],
    ...over,
  };
}

const deals = [
  makeProduct({ id: "p-deal", dealOfDay: true, price: 900, oldPrice: 1000, sold: 5 }), // 10%
  makeProduct({ id: "p-half", price: 500, oldPrice: 1000, sold: 900 }), // 50%
  makeProduct({ id: "p-seventy", price: 300, oldPrice: 1000, sold: 50, stock: 3 }), // 70%
  makeProduct({ id: "p-full", price: 1000, sold: 400 }), // 0%
];

describe("ofertas relâmpago da homepage", () => {
  it("calcula o desconto real e ignora produtos sem preço antigo", () => {
    expect(discountOf(deals[1])).toBe(50);
    expect(discountOf(deals[3])).toBe(0);
  });

  it("prioriza as ofertas do dia e depois o maior desconto", () => {
    expect(selectFlashDeals(deals, 3).map((p) => p.id)).toEqual([
      "p-deal",
      "p-seventy",
      "p-half",
    ]);
  });

  it("respeita o limite e não altera a lista recebida", () => {
    const original = deals.map((p) => p.id);
    expect(selectFlashDeals(deals, 2)).toHaveLength(2);
    expect(selectFlashDeals(deals, 99)).toHaveLength(4);
    expect(deals.map((p) => p.id)).toEqual(original);
  });
});
