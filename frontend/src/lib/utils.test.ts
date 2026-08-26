import { describe, expect, it } from "vitest";
import { cn, slugify, truncate } from "./utils";

describe("cn", () => {
  it("junta classes e ignora valores falsy", () => {
    expect(cn("a", false, "b", null, undefined, "c")).toBe("a b c");
  });

  it("devolve string vazia sem classes válidas", () => {
    expect(cn()).toBe("");
    expect(cn(false, null, undefined)).toBe("");
  });
});

describe("slugify", () => {
  it("remove acentos e caracteres especiais", () => {
    expect(slugify("Smartphone NSM X10 · 128 GB")).toBe("smartphone-nsm-x10-128-gb");
  });

  it("normaliza maiúsculas e acentos", () => {
    expect(slugify("Café Carioca")).toBe("cafe-carioca");
  });
});

describe("truncate", () => {
  it("corta com reticências", () => {
    expect(truncate("abcdefghij", 5)).toBe("abcde…");
  });

  it("devolve o texto inteiro se couber no limite", () => {
    expect(truncate("abc", 5)).toBe("abc");
  });
});
