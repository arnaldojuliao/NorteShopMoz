package mz.norteshopmoz.api.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Date;
import java.util.List;
import io.jsonwebtoken.Claims;
import mz.norteshopmoz.api.config.JwtCookieService;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Filtro JWT: valida o token do cookie HttpOnly (nsm_at) ou header Authorization: Bearer.
 * Prioridade: cookie > header (para browsers). Header mantido para clientes API/móvel.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final SessionRevocationService sessionRevocationService;
    private final JwtCookieService jwtCookieService;

    public JwtAuthenticationFilter(JwtService jwtService,
            SessionRevocationService sessionRevocationService, JwtCookieService jwtCookieService) {
        this.jwtService = jwtService;
        this.sessionRevocationService = sessionRevocationService;
        this.jwtCookieService = jwtCookieService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        // Tenta ler do cookie HttpOnly primeiro (browser)
        String token = jwtCookieService.getAccessToken(request).orElse(null);

        // Fallback: header Authorization (clientes API, mobile, Swagger)
        if (token == null) {
            String header = request.getHeader("Authorization");
            if (header != null && header.startsWith("Bearer ")) {
                token = header.substring(7);
            }
        }

        if (token != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                Claims claims = jwtService.parseClaims(token);
                String email = claims.getSubject();
                String uid = claims.get("uid", String.class);
                Date issuedAt = claims.getIssuedAt();
                // Sessão revogada (ex.: palavra-passe reposta) → segue como anónimo (401 nas rotas protegidas).
                boolean revoked = uid != null && issuedAt != null
                        && sessionRevocationService.isRevoked(uid, issuedAt.getTime());
                if (!revoked) {
                    authenticate(request, claims);
                }
            } catch (JwtException | IllegalArgumentException ignored) {
                // token inválido/expirado → pedido segue como anónimo (401 quando protegido)
            }
        }
        filterChain.doFilter(request, response);
    }

    private void authenticate(HttpServletRequest request, Claims claims) {
        String email = claims.getSubject();
        String uid = claims.get("uid", String.class);
        String name = claims.get("name", String.class);
        String role = claims.get("role", String.class);
        if (role == null || role.isBlank()) {
            role = "CUSTOMER";
        }
        UserPrincipal principal = new UserPrincipal(uid, email, name, role);
        var authentication = new UsernamePasswordAuthenticationToken(
                principal, null, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }
}