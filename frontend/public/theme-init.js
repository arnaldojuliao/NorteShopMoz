/*
 * NS · NorteShopMoz — bootstrap do tema.
 *
 * Aplica o tema guardado (nsm:theme) antes da primeira pintura, evitando o
 * flash claro/escuro. É um ficheiro estático (em vez de um <script> inline)
 * para que a Content-Security-Policy possa usar nonce sem 'unsafe-inline':
 * scripts da própria origem são cobertos por script-src 'self'.
 */
(function () {
  try {
    var raw = localStorage.getItem("nsm:theme");
    var theme = null;
    if (raw) {
      try {
        theme = JSON.parse(raw);
      } catch {
        // Valor não-JSON (versões antigas guardavam a string crua).
        theme = raw;
      }
    }
    if (theme !== "light" && theme !== "dark" && theme !== "system") theme = "system";
    var dark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch {
    /* localStorage indisponível (modo privado/iframe) — mantém o tema claro */
  }
})();
