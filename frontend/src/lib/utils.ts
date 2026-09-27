export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/**
 * Serializa dados para um bloco JSON-LD (`<script type="application/ld+json">`)
 * de forma segura para injeção via `dangerouslySetInnerHTML`.
 *
 * `JSON.stringify` NÃO escapa `<`, `>`, `&` nem os separadores U+2028/U+2029: um
 * valor que contenha `</script>` (ex.: o nome de um produto criado no painel)
 * fecha o elemento antes do fim e o que vier a seguir é interpretado como HTML —
 * XSS armazenado. Escapamos esses caracteres como sequências Unicode, que o
 * `JSON.parse` lê na mesma: o conteúdo semântico para os motores de busca não
 * muda, só deixa de ser possível fechar o `<script>` a partir dos dados.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Verdadeiro se `src` é utilizável pelo `next/image` e pelos metadados:
 * caminho absoluto do site ("/…"), URL absoluta http(s) ou data URI.
 * Caminhos relativos como "img.jpg" são rejeitados — o `next/image` tenta
 * construir um URL e rebenta ("Failed to parse src" / "Invalid URL").
 */
export function isValidImageSrc(src: unknown): src is string {
  return (
    typeof src === "string" &&
    (src.startsWith("/") ||
      src.startsWith("http://") ||
      src.startsWith("https://") ||
      src.startsWith("data:"))
  );
}
