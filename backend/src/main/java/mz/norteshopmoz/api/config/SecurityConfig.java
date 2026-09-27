package mz.norteshopmoz.api.config;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import mz.norteshopmoz.api.security.ClientIpResolver;
import mz.norteshopmoz.api.security.JwtAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Segurança stateless com JWT em cookies HttpOnly + CSRF protection.
 * <ul>
 *   <li>Público: catálogo (GET /api/products, /api/categories), registo/login,
 *       criação de pedido (guest checkout) e consulta de um pedido por ID
 *       (GET /api/orders/{id} — lookup por ID de alta entropia).</li>
 *   <li>Autenticado: listar os meus pedidos (GET /api/orders) e perfil (/api/auth/me).</li>
 *   <li>Admin: gestão de produtos, pedidos, newsletter, uploads.</li>
 * </ul>
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
            JwtAuthenticationFilter jwtFilter,
            SecurityHeadersFilter securityHeadersFilter,
            CsrfProtectionFilter csrfFilter,
            RateLimitFilter rateLimitFilter) throws Exception {

        http.csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/auth/register", "/api/auth/login", "/api/auth/social",
                                "/api/auth/verify-email", "/api/auth/refresh", "/api/auth/revoke-refresh",
                                "/api/auth/forgot-password", "/api/auth/reset-password",
                                // Entrega o token CSRF no corpo (o cookie é host-only:
                                // com a API num subdomínio o JS do frontend não o lê).
                                "/api/auth/csrf",
                                "/error").permitAll()
                        // Newsletter — subscrição pública; lista de subscritores apenas admin.
                        .requestMatchers(HttpMethod.POST, "/api/newsletter/subscribe").permitAll()
                        // ── Área de administração (rotas /api/admin) ─────────────────────
                        // Cupões — gestão apenas para admin (tem de vir antes do denyAll).
                        .requestMatchers("/api/admin/coupons", "/api/admin/coupons/**").hasRole("ADMIN")
                        .requestMatchers("/api/admin/**").denyAll()
                        // Lista de todos os pedidos, estatísticas e transição de estado — apenas admin.
                        .requestMatchers("/api/orders/admin/all", "/api/orders/admin/stats").hasRole("ADMIN")
                        .requestMatchers("/api/orders/*/status").hasRole("ADMIN")
                        // Subscritores da newsletter — apenas admin.
                        .requestMatchers("/api/newsletter/subscribers").hasRole("ADMIN")
                        // Produtos: criar, editar e remover — apenas admin.
                        .requestMatchers(HttpMethod.POST, "/api/products").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/products/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/products/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/products/**").hasRole("ADMIN")
                        // Upload de imagens — apenas admin (qualquer método).
                        .requestMatchers("/api/upload").hasRole("ADMIN")
                        // Actuator: health/info são públicos (abaixo). Prometheus e
                        // métricas só são acessíveis de rede interna (ex.: o
                        // container do Prometheus) ou por um admin autenticado —
                        // antes, qualquer utilizador autenticado podia fazer
                        // scraping do estado interno.
                        .requestMatchers("/actuator/prometheus", "/actuator/metrics", "/actuator/metrics/**")
                        .access(actuatorAccess())
                        // Imagens enviadas pelos admins — públicas.
                        .requestMatchers(HttpMethod.GET, "/uploads/**").permitAll()
                        .requestMatchers(HttpMethod.GET,
                                "/api/products/**",
                                "/api/categories/**",
                                "/api/orders/*",
                                "/api/shipping",
                                "/api/cart",
                                // /actuator/health/** cobre as sondas liveness/readiness
                                // usadas pelo healthcheck do contentor e pelo deploy.sh.
                                "/actuator/health",
                                "/actuator/health/**",
                                "/actuator/info").permitAll()
                        // Métodos de pagamento disponíveis — público (o checkout
                        // desativa no UI os métodos que o servidor não consegue cobrar).
                        .requestMatchers(HttpMethod.GET, "/api/payments/methods").permitAll()
                        // Validação de cupão no checkout — pública (guest checkout).
                        .requestMatchers(HttpMethod.POST, "/api/orders/validate-coupon").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/orders").permitAll()
                        // Carrinho de convidado (X-Guest-Id) sem conta.
                        .requestMatchers(HttpMethod.PUT, "/api/cart").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(eh -> eh
                        .authenticationEntryPoint((request, response, ex) -> {
                            response.setStatus(401);
                            response.setContentType("application/json;charset=UTF-8");
                            response.getWriter().write("{\"error\":\"Não autenticado — forneça um token JWT válido\"}");
                        })
                        .accessDeniedHandler((request, response, ex) -> {
                            response.setStatus(403);
                            response.setContentType("application/json;charset=UTF-8");
                            response.getWriter().write("{\"error\":\"Sem permissões de administrador\"}");
                        }))
                // Filtros de segurança (ordem importa!)
                .addFilterBefore(securityHeadersFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(csrfFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(rateLimitFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * Acesso aos endpoints de métricas do Actuator: permitido a pedidos de rede
     * interna (loopback/privados — o Prometheus corre no host/rede Docker) ou a
     * qualquer cliente autenticado com role ADMIN.
     */
    private static AuthorizationManager<RequestAuthorizationContext> actuatorAccess() {
        return (authentication, context) -> {
            HttpServletRequest request = context.getRequest();
            String ip = ClientIpResolver.resolve(request);
            if (ClientIpResolver.isPrivate(ip)) {
                return new AuthorizationDecision(true);
            }
            var current = authentication == null ? null : authentication.get();
            boolean admin = current != null && current.getAuthorities().stream()
                    .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
            return new AuthorizationDecision(admin);
        };
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        // BCrypt com cost 12 (padrão Spring Boot 3.x) — mais lento, mais seguro
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource(AppProperties props) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(props.cors().allowedOrigins());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        // Headers permitidos: Authorization (legacy), X-CSRF-Token, Idempotency-Key, X-Guest-Id
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept",
                "Idempotency-Key", "X-Guest-Id", "X-CSRF-Token"));
        // Expor headers necessários para o frontend
        config.setExposedHeaders(List.of("Authorization", "X-CSRF-Token"));
        config.setAllowCredentials(true); // Essencial para cookies HttpOnly
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}