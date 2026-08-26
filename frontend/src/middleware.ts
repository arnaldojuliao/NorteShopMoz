import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware de segurança Next.js.
 * - Gera CSP nonce para scripts inline
 * - Adiciona headers de segurança
 * - Redireciona HTTP para HTTPS em produção
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

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Headers de segurança (defesa em profundidade — Nginx também adiciona)
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");

  // HSTS (apenas em produção/HTTPS)
  const isProduction = process.env.NODE_ENV === "production";
  const isHttps = request.nextUrl.protocol === "https:";
  if (isProduction && isHttps) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  // CSP — a origem da API tem de estar explicitamente permitida em connect-src
  // e img-src (imagens de produto servidas pelo backend), senão TODAS as
  // chamadas fetch falham quando frontend e backend estão em origens distintas.
  const api = apiOrigins();
  const apiParts = api.map((o) => o).join(" ");
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: https:${apiParts ? ` ${apiParts}` : ""}`,
    `connect-src 'self'${apiParts ? ` ${apiParts}` : ""} https://api.stripe.com https://*.cloudinary.com`,
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

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