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
import mz.norteshopmoz.api.config.JwtCookieService;
import mz.norteshopmoz.api.repository.UserRepository;
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
    private final SessionIdleService sessionIdleService;
    private final JwtCookieService jwtCookieService;
    private final UserRepository userRepository;
    private final RoleCache roleCache;

    public JwtAuthenticationFilter(JwtService jwtService,
            SessionRevocationService sessionRevocationService, SessionIdleService sessionIdleService,
            JwtCookieService jwtCookieService,
            UserRepository userRepository,
            RoleCache roleCache) {
        this.jwtService = jwtService;
        this.sessionRevocationService = sessionRevocationService;
        this.sessionIdleService = sessionIdleService;
        this.jwtCookieService = jwtCookieService;
        this.userRepository = userRepository;
        this.roleCache = roleCache;
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
                // Só tokens de acesso ("typ"="access"). O refresh token é assinado
                // com a mesma chave e tem validade maior — sem esta verificação
                // passaria como access token no cookie nsm_at ou em
                // Authorization: Bearer, contornando a expiração curta. O refresh
                // tem de passar pelo endpoint /api/auth/refresh.
                if ("access".equals(claims.get("typ", String.class))) {
                    String uid = claims.get("uid", String.class);
                    Date issuedAt = claims.getIssuedAt();
                    // Sessão revogada (ex.: palavra-passe reposta) → segue como anónimo (401 nas rotas protegidas).
                    boolean revoked = uid != null && issuedAt != null
                            && sessionRevocationService.isRevoked(uid, issuedAt.getTime());
                    // Inatividade (idle timeout) imposta pelo SERVIDOR: o token pode
                    // ainda estar dentro da validade criptográfica e a sessão já ter
                    // caducado por falta de uso. A verificação também renova a janela
                    // (uma só ida ao Redis). Ver SessionIdleService.
                    boolean sessionExpired = !sessionIdleService.isActiveAndTouch(
                            claims.get("sid", String.class));
                    if (!revoked && !sessionExpired) {
                        authenticate(request, claims);
                    }
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
        // Releitura do role atual da base de dados (cache TTL de 60 s em
        // RoleCache): promoções/rebaixamentos aplicam-se sem esperar um novo
        // login, SEM uma query de DB por pedido — antes, cada request
        // autenticado ia à base de dados só para ler o role.
        if (uid != null) {
            String cached = roleCache.get(uid);
            if (cached == null) {
                var current = userRepository.findById(uid).orElse(null);
                cached = current != null && current.getRole() != null && !current.getRole().isBlank()
                        ? current.getRole()
                        // Utilizador inexistente (ex.: apagado): fallback ao claim —
                        // a expulsão real continua a cargo da revogação de sessão.
                        : role;
                roleCache.put(uid, cached);
            }
            if (!cached.isBlank()) {
                role = cached;
            }
        }
        UserPrincipal principal = new UserPrincipal(uid, email, name, role,
                claims.get("sid", String.class));
        var authentication = new UsernamePasswordAuthenticationToken(
                principal, null, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }
}