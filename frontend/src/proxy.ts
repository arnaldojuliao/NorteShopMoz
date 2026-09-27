import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware de segurança Next.js.
 * - CSP (ver nota abaixo)
 * - Headers de segurança (X-Frame-Options, nosniff, Referrer-Policy, …)
 * - HSTS em produção/HTTPS
 *
 * ⚠️ NOTA sobre o CSP nonce (testado, não usar sem mudar a estratégia de render):
 * A loja é maioritariamente **SSG** — as páginas são geradas no build. O Next.js
 * injeta scripts inline do próprio framework (bootstrap React e o stream de
 * `self.__next_f`) em cada página, e **um nonce por pedido não pode ser gravado
 * num HTML pré-renderizado**. Verificado num build de produção: com
 * `script-src 'nonce-…'` (sem 'unsafe-inline') o browser bloqueia os 4 scripts
 * inline (`script-src-elem :: inline`), `window.__next_f` fica vazio e a
 * aplicação deixa de hidratar.
 *
 * Além disso, a especificação CSP ignora 'unsafe-inline' sempre que existe um
 * nonce ou hash — ou seja, juntar os dois não resolve: quebra os scripts sem
 * nonce.
 *
 * Para remover o 'unsafe-inline' seria preciso uma destas vias:
 *   1. hashes 'sha256-…' dos scripts inline do Next em cada build; ou
 *   2. renderização dinâmica de todas as páginas (perde-se SSG/SEO/performance);
 *   3. proxies/CDN que reescrevem o HTML e injetam o nonce por resposta.
 * Até lá, o 'unsafe-inline' é a opção correta para este modelo de render.
 * O script de tema já não depende dele: vive em /public/theme-init.js.
 */

/** Origens da API que o browser pode chamar (derivadas das variáveis de ambiente). */
function apiOrigins(): string[] {
  const urls = [
    process.env.NEXT_PUBLIC_API_BASE_URL,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_APP_URL === process.env.NEXT_PUBLIC_API_BASE_URL
      ? undefined
      : process.env.NEXT_PUBLIC_API_URL,
  ].filter((u): u is string => Boolean(u));
  const origins = new Set<string>();
  for (const url of urls) {
    try {
      origins.add(new URL(url).origin);
    } catch {
      /* URL inválida — ignora */
    }
  }
  return [...origins];
}

export function proxy(request: NextRequest) {
  const isProduction = process.env.NODE_ENV === "production";
  const isHttps = request.nextUrl.protocol === "https:";

  // CSP — a origem da API tem de estar explicitamente permitida em connect-src
  // e img-src (imagens de produto servidas pelo backend), senão TODAS as
  // chamadas fetch falham quando frontend e backend estão em origens distintas.
  const api = apiOrigins();
  const apiParts = api.join(" ");
  const csp = [
    "default-src 'self'",
    // 'unsafe-inline' é necessário para os scripts inline do Next (ver nota acima).
    // 'unsafe-eval' fica reservado ao dev server (React Refresh).
    // accounts.google.com (GSI) e connect.facebook.net (SDK do Facebook) são os SDKs
    // de login social: sem eles aqui, o browser bloqueia os scripts e os botões de
    // login social ficam mortos (ver LoginModal.tsx).
    `script-src 'self' 'unsafe-inline' https://js.stripe.com https://accounts.google.com https://connect.facebook.net${isProduction ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: https:${apiParts ? ` ${apiParts}` : ""}`,
    // connect-src: além da API/Stripe/Cloudinary, os SDKs de login social falam
    // com as suas próprias origens (Google Identity, Graph API do Facebook).
    `connect-src 'self'${apiParts ? ` ${apiParts}` : ""} https://api.stripe.com https://*.cloudinary.com https://accounts.google.com https://graph.facebook.com https://connect.facebook.net`,
    // frame-src: o GSI e o SDK do Facebook podem abrir iframes das suas origens.
    "frame-src https://js.stripe.com https://hooks.stripe.com https://accounts.google.com https://connect.facebook.net https://www.facebook.com",
    // Endurecimentos que não colidem com o SSG.
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // `upgrade-insecure-requests` SÓ sobre HTTPS. Em modo HTTP (acesso por
    // IP, o modo de deploy por omissão — ver docker-compose.prod.yml) o
    // browser reescreve todos os subrecursos e chamadas fetch para https://,
    // onde não há TLS nenhum a escutar: a página abria e TODAS as chamadas à
    // API, imagens e login falhavam sem um único erro no servidor.
    ...(isProduction && isHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const response = NextResponse.next();

  // Headers de segurança (defesa em profundidade — Nginx também adiciona)
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");

  if (isProduction && isHttps) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  // Aplicar a todas as rotas exceto assets estáticos e API routes
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, robots.txt, sitemap.xml (static files)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
