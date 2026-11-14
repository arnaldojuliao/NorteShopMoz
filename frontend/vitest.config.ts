import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Os testes de componente usam JSX e o transformador do Vite trata disto
  // sozinho — não é preciso o plugin @vitejs/plugin-react, que aqui só traria
  // mais uma versão de Vite para manter alinhada.
  test: {
    // "node" por omissão: metade da lógica distingue servidor de browser
    // (`typeof window === "undefined"`, ver apiBase.ts) e em jsdom passaria
    // sempre pelo ramo do browser. Os testes de componente pedem jsdom
    // explicitamente com `// @vitest-environment jsdom` no topo do ficheiro.
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "lcovonly"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/test/**",
        // Ficheiros de configuração do Next: não têm lógica para cobrir.
        "src/app/**/layout.tsx",
        "src/app/**/loading.tsx",
        "src/app/**/error.tsx",
        "src/app/**/not-found.tsx",
      ],
    },
  },
});
