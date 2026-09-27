import { describe, expect, it } from "vitest";
import { envOr } from "./env";

describe("envOr", () => {
  it("devolve o valor quando definido", () => {
    expect(envOr("https://loja.mz", "https://padrao.mz")).toBe("https://loja.mz");
  });

  it("usa o fallback quando a variável está ausente", () => {
    expect(envOr(undefined, "https://padrao.mz")).toBe("https://padrao.mz");
    expect(envOr(null, "https://padrao.mz")).toBe("https://padrao.mz");
  });

  it("trata string vazia (build arg não fornecido) como ausente", () => {
    // Docker/Next definem "" quando o build arg falta — `??` não apanhava isto.
    expect(envOr("", "http://localhost:8081")).toBe("http://localhost:8081");
    expect(envOr("   ", "http://localhost:8081")).toBe("http://localhost:8081");
  });
});
