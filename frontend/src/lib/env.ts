/**
 * Leitura de variáveis de ambiente públicas (`NEXT_PUBLIC_*`) com tratamento de
 * valores vazios.
 *
 * Porque é necessário: os build args/`ENV` do Docker definem **string vazia**
 * quando o valor não é fornecido (não `undefined`), e `?? fallback` só substitui
 * `null`/`undefined`. Sem isto, um arg em falta produzia `site.url = ""`
 * (`new URL("")` rebenta o build), `API_BASE = ""` (o `fetch` do Node rejeita
 * URLs relativas no SSR) e chaves de ofuscação derivadas de password vazia.
 *
 * O valor é passado à função (e não o nome da chave) para que o Next consiga
 * inlinar `process.env.NEXT_PUBLIC_*` no bundle do browser — o acesso dinâmico
 * (`process.env[key]`) não é substituído pelo bundler.
 */
export function envOr(value: string | undefined | null, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}
