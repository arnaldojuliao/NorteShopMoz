package mz.norteshopmoz.api.config;

import java.util.List;
import mz.norteshopmoz.api.security.JwtAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
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
                                "/api/auth/forgot-password", "/api/auth/reset-password", "/error").permitAll()
                        // Newsletter — subscrição pública; lista de subscritores apenas admin.
                        .requestMatchers(HttpMethod.POST, "/api/newsletter/subscribe").permitAll()
                        // ── Área de administração (rotas /api/admin) ─────────────────────
                        .requestMatchers("/api/admin/**").denyAll()
                        // Lista de todos os pedidos e transição de estado — apenas admin.
                        .requestMatchers("/api/orders/admin/all").hasRole("ADMIN")
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
                        // Imagens enviadas pelos admins — públicas.
                        .requestMatchers(HttpMethod.GET, "/uploads/**").permitAll()
                        .requestMatchers(HttpMethod.GET,
                                "/api/products/**",
                                "/api/categories/**",
                                "/api/orders/*",
                                "/api/shipping",
                                "/api/cart",
                                "/actuator/health",
                                "/actuator/info").permitAll()
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