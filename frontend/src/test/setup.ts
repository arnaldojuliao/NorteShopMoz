// Configuração partilhada pelos testes (vitest.config.ts → setupFiles).
//
// Registar os matchers do jest-dom (toBeInTheDocument, toHaveValue, …) é seguro
// mesmo nos testes que correm em ambiente node: só é preciso DOM na altura em
// que são usados.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// Limpa o DOM entre testes de componente, para um teste não herdar o render do
// anterior. Nos ficheiros que correm em node não há DOM — e não há nada a fazer.
afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
