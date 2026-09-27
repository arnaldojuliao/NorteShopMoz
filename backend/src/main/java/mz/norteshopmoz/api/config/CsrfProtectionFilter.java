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
import java.util.Set;
import mz.norteshopmoz.api.security.ClientIpResolver;
import mz.norteshopmoz.api.security.JwtService;

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
    private final JwtService jwtService;

    /**
     * Endpoints públicos que NÃO precisam de CSRF — correspondência EXATA.
     * Não usar prefixos aqui: um prefixo "/api/orders" isentaria também
     * PATCH /api/orders/{id}/status e DELETE /api/orders/{id}, que alteram
     * estado autenticado e têm de ser validados.
     */
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
            "/api/upload",                   // POST - admin, multipart
            "/actuator/health",
            "/actuator/info"
    };

    /**
     * Isentos apenas quando o pedido é <strong>anónimo</strong> (convidado): o
     * checkout de convidado e o carrinho de convidado não têm sessão e não podem
     * apresentar token CSRF.
     *
     * <p>Um pedido AUTENTICADO ao mesmo path (ex.: {@code PUT /api/cart} com
     * conta, ou checkout com sessão) continua a exigir CSRF. Antes estes paths
     * estavam na lista de isenção incondicional, pelo que o carrinho/checkout
     * autenticados ficavam sem proteção CSRF.</p>
     */
    private static final Set<String> GUEST_EXEMPT_PATHS = Set.of(
            "/api/orders",                   // POST (guest checkout) - usa Idempotency-Key
            "/api/orders/validate-coupon",   // público (convidado valida cupão)
            "/api/cart"                      // PUT (guest cart) - usa X-Guest-Id
    );

    // Prefixos de paths que requerem CSRF (mutating operations)
    private static final String[] CSRF_REQUIRED_PREFIXES = {
            "/api/auth/me",
            "/api/auth/verify-email-code",   // autenticado + altera estado da conta
            "/api/auth/resend-verification", // idem (envia email)
            "/api/orders/",
            "/api/cart",
            "/api/favorites",
            "/api/addresses",
            "/api/products", // Admin product management
            "/api/admin",
            "/api/newsletter/subscribers",
            "/api/upload"
    };

    public CsrfProtectionFilter(JwtCookieService jwtCookieService, JwtService jwtService) {
        this.jwtCookieService = jwtCookieService;
        this.jwtService = jwtService;
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

        // Verifica se path está na lista de isenção (correspondência exata —
        // ver nota em CSRF_EXEMPT_PATHS).
        for (String exempt : CSRF_EXEMPT_PATHS) {
            if (path.equals(exempt)) {
                filterChain.doFilter(request, response);
                return;
            }
        }

        // Isenção só para convidados: sem sessão de COOKIE válida não há token
        // CSRF a apresentar. Com sessão de cookie (browser), o mesmo path tem de
        // validar CSRF. Autenticação por Bearer não é suscetível a CSRF (o
        // atacante não consegue definir o cabeçalho Authorization a partir de
        // outro site), pelo que fica isenta — não parte clientes API/mobile.
        if (GUEST_EXEMPT_PATHS.contains(path) && !hasValidSessionCookie(request)) {
            filterChain.doFilter(request, response);
            return;
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

    /**
     * Existe um access token VÁLIDO no cookie {@code nsm_at}?
     *
     * <p>Só a sessão de cookie (browser) ativa a exigência de CSRF nos paths de
     * convidado — é a única credencial ambiente que um site terceiro pode enviar
     * em nome do utilizador. Um cookie ausente, inválido ou expirado é tratado
     * como convidado; nesse caso a autenticação a seguir devolve 401 nas rotas
     * protegidas, pelo que não há perda de segurança.</p>
     */
    private boolean hasValidSessionCookie(HttpServletRequest request) {
        String token = jwtCookieService.getAccessToken(request).orElse(null);
        if (token == null || token.isBlank()) {
            return false;
        }
        try {
            return "access".equals(jwtService.parseClaims(token).get("typ", String.class));
        } catch (Exception e) {
            return false;
        }
    }

    /** IP do cliente resolvido de forma segura (usado apenas nos logs). */
    private String getClientIp(HttpServletRequest request) {
        return ClientIpResolver.resolve(request);
    }
}