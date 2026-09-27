import { describe, expect, it } from "vitest";
import { cn, isValidImageSrc, serializeJsonLd, slugify, truncate } from "./utils";

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

describe("serializeJsonLd", () => {
  it("escapa '<' de conteúdo para não fechar o script", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(out).toContain("\\u003c");
  });

  it("mantém JSON válido (o parse devolve o valor original)", () => {
    const value = { name: "Capa & <br> 5 > 3", urls: ["a&b"] };
    expect(JSON.parse(serializeJsonLd(value))).toEqual(value);
  });

  it("escapa separadores de linha U+2028/U+2029", () => {
    const out = serializeJsonLd({ t: "a\u2028b\u2029c" });
    expect(out).not.toContain("\u2028");
    expect(out).not.toContain("\u2029");
  });
});

describe("isValidImageSrc", () => {
  it("aceita caminho absoluto, http(s) e data URI", () => {
    expect(isValidImageSrc("/img/produto.jpg")).toBe(true);
    expect(isValidImageSrc("https://cdn.exemplo.com/a.jpg")).toBe(true);
    expect(isValidImageSrc("http://localhost:8081/uploads/a.jpg")).toBe(true);
    expect(isValidImageSrc("data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E")).toBe(true);
  });

  it("rejeita caminhos relativos que fazem o next/image rebentar", () => {
    expect(isValidImageSrc("img.jpg")).toBe(false);
    expect(isValidImageSrc("")).toBe(false);
    expect(isValidImageSrc(undefined)).toBe(false);
    expect(isValidImageSrc(null)).toBe(false);
  });
});
