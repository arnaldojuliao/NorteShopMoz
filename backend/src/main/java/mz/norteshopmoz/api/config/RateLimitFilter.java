package mz.norteshopmoz.api.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Filtro de rate limiting aplicado antes da autenticação (CSRF, JWT).
 * <p>
 * Ordem: antes do CsrfProtectionFilter (ORDER - 100) e JwtAuthenticationFilter.
 * Aplica limites diferentes conforme o path:
 * - /api/auth/** → limite estrito (login, register, etc.)
 * - /api/** → limite padrão
 * - outros → sem limite (assets, health, etc.)
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10) // Antes de CSRF e JWT
public class RateLimitFilter extends OncePerRequestFilter {

    private final RateLimiter rateLimiter;

    public RateLimitFilter(RateLimiter rateLimiter) {
        this.rateLimiter = rateLimiter;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();

        // Ignora health checks, assets estáticos, webjars
        if (shouldSkip(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        // Métodos seguros não são limitados: leituras de catálogo/pesquisa são
        // legítimas em rajada (navegação, prefetch) e não têm risco de brute-force.
        // A proteção contra abuso concentra-se nos endpoints que alteram estado.
        String method = request.getMethod();
        if ("GET".equals(method) || "HEAD".equals(method) || "OPTIONS".equals(method)) {
            filterChain.doFilter(request, response);
            return;
        }

        // Determina configuração baseada no path
        String configName = resolveConfig(path);
        String clientKey = resolveClientKey(request, path);

        RateLimiter.RateLimitResult result = rateLimiter.tryAcquire(clientKey, configName);

        // Headers informativos (RFC 6585 / RFC 7231)
        response.setHeader("X-RateLimit-Limit", String.valueOf(result.limit()));
        response.setHeader("X-RateLimit-Remaining", String.valueOf(Math.max(0, result.limit() - result.current())));
        response.setHeader("X-RateLimit-Reset", String.valueOf(result.resetSeconds()));

        if (!result.allowed()) {
            response.setStatus(429); // SC_TOO_MANY_REQUESTS
            response.setHeader("Retry-After", String.valueOf(result.retryAfterSeconds()));
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"error\":\"Muitas requisições. Tente novamente em " + result.retryAfterSeconds() + " segundos.\"}");
            return;
        }

        filterChain.doFilter(request, response);
    }

    private boolean shouldSkip(String path) {
        return path.startsWith("/actuator/health")
                || path.startsWith("/actuator/info")
                || path.startsWith("/_next/")
                || path.startsWith("/static/")
                || path.startsWith("/webjars/")
                || path.startsWith("/favicon.ico")
                || path.startsWith("/robots.txt")
                || path.startsWith("/sitemap.xml")
                || path.startsWith("/manifest.webmanifest")
                || path.equals("/");
    }

    private String resolveConfig(String path) {
        if (path.startsWith("/api/auth/")) {
            // Endpoints alvo de brute-force → bucket estrito ("auth").
            // Os restantes (/me, /refresh, /logout) correm em cada carregamento
            // de página e partilham o bucket normal da API — um limite estrito
            // aqui bloquearia utilizadores legítimos ao navegar.
            if (isStrictAuthEndpoint(path)) {
                return "auth";
            }
            return "api";
        }
        if (path.startsWith("/api/")) {
            return "api"; // demais endpoints da API
        }
        return "default"; // frontend pages, etc.
    }

    /** Endpoints de autenticação sensíveis (tentativa de credenciais/tokens). */
    private static boolean isStrictAuthEndpoint(String path) {
        return path.equals("/api/auth/login")
                || path.equals("/api/auth/register")
                || path.equals("/api/auth/social")
                || path.equals("/api/auth/forgot-password")
                || path.equals("/api/auth/reset-password")
                || path.equals("/api/auth/verify-email");
    }

    private String resolveClientKey(HttpServletRequest request, String path) {
        // Para endpoints de auth, usa IP + path (ex.: login:192.168.1.1:/api/auth/login)
        // Para demais, usa IP ou userId se autenticado
        String ip = getClientIp(request);

        if (path.startsWith("/api/auth/")) {
            // Inclui o path para diferenciar login vs register vs refresh
            return "auth:" + ip + ":" + path;
        }

        // Tenta obter userId do principal (se já autenticado via JWT)
        // Como o filtro roda ANTES do JWT filter, o principal ainda não está disponível aqui.
        // Usa IP como fallback.
        return "api:" + ip;
    }

    private String getClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        String xri = request.getHeader("X-Real-IP");
        if (xri != null && !xri.isBlank()) {
            return xri;
        }
        return request.getRemoteAddr();
    }
}