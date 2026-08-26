package mz.norteshopmoz.api.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Filtro CSRF baseado no padrão Double-Submit Cookie.
 * 
 * Protege endpoints que modificam estado (POST, PUT, PATCH, DELETE)
 * exceto endpoints públicos de autenticação (login, register, refresh).
 * 
 * O CSRF token é:
 * - Gerado no login/refresh e guardado em cookie HttpOnly=false (legível por JS)
 * - Enviado pelo frontend no header X-CSRF-Token
 * - Validado aqui comparando header com cookie
 */
@Component
public class CsrfProtectionFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(CsrfProtectionFilter.class);

    private final JwtCookieService jwtCookieService;

    // Endpoints públicos que NÃO precisam de CSRF (stateless ou safe methods)
    private static final String[] CSRF_EXEMPT_PATHS = {
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/social",
            "/api/auth/refresh",
            "/api/auth/verify-email",
            "/api/auth/forgot-password",
            "/api/auth/reset-password",
            "/api/auth/revoke-refresh",
            "/api/newsletter/subscribe",
            "/api/orders", // POST /api/orders (guest checkout) - usa Idempotency-Key
            "/api/cart",   // PUT /api/cart (guest cart) - usa X-Guest-Id
            "/api/upload", // POST /api/upload - admin only, mas multipart
            "/actuator/health",
            "/actuator/info"
    };

    // Prefixos de paths que requerem CSRF (mutating operations)
    private static final String[] CSRF_REQUIRED_PREFIXES = {
            "/api/auth/me",
            "/api/orders/",
            "/api/cart",
            "/api/favorites",
            "/api/addresses",
            "/api/products", // Admin product management
            "/api/admin",
            "/api/newsletter/subscribers",
            "/api/upload"
    };

    public CsrfProtectionFilter(JwtCookieService jwtCookieService) {
        this.jwtCookieService = jwtCookieService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String method = request.getMethod();
        String path = request.getRequestURI();

        // Safe methods não precisam de CSRF
        if ("GET".equals(method) || "HEAD".equals(method) || "OPTIONS".equals(method)) {
            filterChain.doFilter(request, response);
            return;
        }

        // Verifica se path está na lista de isenção exata
        for (String exempt : CSRF_EXEMPT_PATHS) {
            if (path.equals(exempt) || path.startsWith(exempt + "/")) {
                filterChain.doFilter(request, response);
                return;
            }
        }

        // Verifica se path requer CSRF
        boolean requiresCsrf = false;
        for (String prefix : CSRF_REQUIRED_PREFIXES) {
            if (path.startsWith(prefix)) {
                requiresCsrf = true;
                break;
            }
        }

        if (!requiresCsrf) {
            filterChain.doFilter(request, response);
            return;
        }

        // Valida CSRF token
        if (!jwtCookieService.validateCsrf(request)) {
            log.warn("CSRF validation failed for {} {} from IP {}", method, path, getClientIp(request));
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"error\":\"CSRF token inválido ou ausente\"}");
            return;
        }

        filterChain.doFilter(request, response);
    }

    private String getClientIp(HttpServletRequest request) {
        String xf = request.getHeader("X-Forwarded-For");
        if (xf != null && !xf.isBlank()) {
            return xf.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}