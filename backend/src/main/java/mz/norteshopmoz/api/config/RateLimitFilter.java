package mz.norteshopmoz.api.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import mz.norteshopmoz.api.security.ClientIpResolver;
import mz.norteshopmoz.api.security.JwtService;

/**
 * Filtro de rate limiting aplicado antes da autenticação (CSRF, JWT).
 *
 * <p>Ordem: antes do CsrfProtectionFilter (ORDER - 100) e JwtAuthenticationFilter.
 * Aplica limites diferentes conforme o path e a identidade:</p>
 * <ul>
 *   <li>{@code /api/auth/**} de credenciais (login, register, …) → bucket
 *       {@code auth} estrito, por IP + path (o bloqueio por brute-force é do
 *       {@code LoginAttemptService}, este limite é a segunda barreira);</li>
 *   <li>restantes {@code /api/**} com sessão → bucket {@code api} por
 *       <strong>conta</strong> ({@code uid} do JWT), não por IP;</li>
 *   <li>restantes {@code /api/**} anónimos (checkout de convidado, carrinho,
 *       cupão) → bucket {@code anon-api} por IP, com um limite
 *       <strong>generoso</strong>;</li>
 *   <li>leituras (GET/HEAD) externas → bucket {@code safe}, também generoso.</li>
 * </ul>
 *
 * <p><strong>Porquê chavear por conta e não por IP:</strong> em redes móveis
 * (CGNAT de operadora) milhares de clientes partilham o mesmo IP público. Um
 * limite por IP para pedidos que alteram estado fazia com que os cliques de
 * poucos clientes consumissem a quota de todos os outros — o checkout devolvia
 * 429 a clientes legítimos. É o mesmo motivo pelo qual o bloqueio de login passou
 * a contar por IP <em>e</em> conta. O limite por IP mantém-se apenas como última
 * barreira para tráfego anónimo, com valores pensados para CGNAT.</p>
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10) // Antes de CSRF e JWT
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

    private final RateLimiter rateLimiter;
    private final JwtCookieService jwtCookieService;
    private final JwtService jwtService;

    public RateLimitFilter(RateLimiter rateLimiter, JwtCookieService jwtCookieService, JwtService jwtService) {
        this.rateLimiter = rateLimiter;
        this.jwtCookieService = jwtCookieService;
        this.jwtService = jwtService;
    }

    /** Bucket (configuração + chave) a usar para um pedido. */
    private record Bucket(String configName, String clientKey) {}

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();

        // Ignora health checks, assets estáticos, webjars
        if (shouldSkip(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        String method = request.getMethod();
        boolean safeMethod = "GET".equals(method) || "HEAD".equals(method) || "OPTIONS".equals(method);

        Bucket bucket;
        if (safeMethod) {
            // Leituras não têm risco de brute-force, mas o catálogo é o alvo
            // natural de scraping em massa — daí um bucket generoso ("safe"),
            // aplicado só a GET/HEAD do /api/.
            //
            // Serviços internos ficam isentos: o servidor do frontend faz SSR e
            // partilha um único IP, pelo que limitá-lo por IP estrangulava a
            // loja inteira em vez de abusadores.
            String ip = ClientIpResolver.resolve(request);
            if (!path.startsWith("/api/") || ClientIpResolver.isPrivate(ip)) {
                filterChain.doFilter(request, response);
                return;
            }
            bucket = new Bucket("safe", "safe:" + ip);
        } else {
            bucket = resolveBucket(request, path);
        }

        RateLimiter.RateLimitResult result;
        try {
            result = rateLimiter.tryAcquire(bucket.clientKey(), bucket.configName());
        } catch (RuntimeException e) {
            // Segunda barreira de fail-open. O RateLimiter já falha aberto, mas este
            // filtro corre ANTES de tudo (inclusive antes do filtro de CORS e da
            // cadeia de segurança): uma exceção inesperada aqui respondia 500 a
            // TODOS os pedidos — incluindo o login — e o browser, ao não conseguir
            // ler uma resposta de erro sem cabeçalhos de CORS, mostrava "não foi
            // possível ligar ao servidor" com a loja perfeitamente acessível.
            log.warn("Rate limit indisponível para '{}' [{}]: {} — pedido deixado passar (fail-open).",
                    bucket.clientKey(), bucket.configName(), e.getMessage());
            filterChain.doFilter(request, response);
            return;
        }

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

    /**
     * Escolhe o bucket e a chave de um pedido que altera estado. Autenticado →
     * por conta; anónimo → por IP com limite generoso (CGNAT).
     */
    private Bucket resolveBucket(HttpServletRequest request, String path) {
        String ip = ClientIpResolver.resolve(request);

        if (path.startsWith("/api/auth/")) {
            // Endpoints alvo de brute-force → bucket estrito ("auth"), por IP+path.
            if (isStrictAuthEndpoint(path)) {
                return new Bucket("auth", "auth:" + ip + ":" + path);
            }
            // /me, /refresh, /logout correm em cada carregamento de página: com
            // sessão, contam para a conta; sem, para o IP no bucket normal.
            String userId = authenticatedUserId(request);
            return userId != null
                    ? new Bucket("api", "api:u:" + userId)
                    : new Bucket("api", "api:ip:" + ip);
        }
        if (path.startsWith("/api/")) {
            String userId = authenticatedUserId(request);
            if (userId != null) {
                return new Bucket("api", "api:u:" + userId);
            }
            // Sem sessão: checkout de convidado, carrinho de convidado, cupão.
            // Não há identidade estável, por isso o limite é por IP — mas
            // deliberadamente alto para sobreviver a um IP partilhado (CGNAT).
            return new Bucket("anon-api", "anon-api:ip:" + ip);
        }
        return new Bucket("default", "default:ip:" + ip);
    }

    /** Endpoints de autenticação sensíveis (tentativa de credenciais/tokens). */
    private static boolean isStrictAuthEndpoint(String path) {
        return path.equals("/api/auth/login")
                || path.equals("/api/auth/register")
                || path.equals("/api/auth/social")
                || path.equals("/api/auth/forgot-password")
                || path.equals("/api/auth/reset-password")
                || path.equals("/api/auth/verify-email")
                || path.equals("/api/auth/verify-email-code");
    }

    /**
     * {@code uid} do access token da sessão, se houver um JWT válido.
     *
     * <p>Só é usado para escolher a chave do rate limit — a autenticação a sério
     * (revogação, inatividade, role) continua a ser decidida no
     * {@code JwtAuthenticationFilter}. Um token inválido devolve {@code null} e
     * cai no bucket por IP: nunca transforma um pedido inválido em ilimitado.</p>
     */
    private String authenticatedUserId(HttpServletRequest request) {
        try {
            String token = jwtCookieService.getAccessToken(request).orElse(null);
            if (token == null) {
                String header = request.getHeader("Authorization");
                if (header != null && header.startsWith("Bearer ")) {
                    token = header.substring(7);
                }
            }
            if (token == null || token.isBlank()) {
                return null;
            }
            var claims = jwtService.parseClaims(token);
            if (!"access".equals(claims.get("typ", String.class))) {
                return null;
            }
            String uid = claims.get("uid", String.class);
            return uid == null || uid.isBlank() ? null : uid;
        } catch (Exception e) {
            // Token ausente/inválido/expirado → trata-se como anónimo.
            return null;
        }
    }
}
