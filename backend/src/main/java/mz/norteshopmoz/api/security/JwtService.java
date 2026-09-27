package mz.norteshopmoz.api.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import mz.norteshopmoz.api.config.AppProperties;
import mz.norteshopmoz.api.domain.UserAccount;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Service;

/** Emissão e validação de tokens JWT (HS256). */
@Service
public class JwtService {

    /**
     * Segredo de desenvolvimento definido em {@code application.yaml}. Está no
     * repositório, logo é público — nunca pode ser usado em produção.
     */
    static final String DEV_DEFAULT_SECRET = "norteshopmoz-dev-secret-change-me-in-production-2026";

    /** HS256 exige uma chave de pelo menos 256 bits (32 bytes). */
    private static final int MIN_SECRET_BYTES = 32;

    private final AppProperties props;
    private final SecretKey key;

    public JwtService(AppProperties props, Environment environment) {
        this.props = props;
        String secret = props.jwt().secret();
        byte[] secretBytes = secret == null ? new byte[0] : secret.getBytes(StandardCharsets.UTF_8);
        if (secretBytes.length < MIN_SECRET_BYTES) {
            throw new IllegalStateException("app.jwt.secret inválido: defina JWT_SECRET com pelo menos "
                    + MIN_SECRET_BYTES + " caracteres (gerar com: openssl rand -base64 48).");
        }
        // Fail-fast em produção: com o segredo de desenvolvimento, qualquer pessoa
        // forja JWTs válidos (incluindo role=ADMIN). É preferível não arrancar a
        // arrancar silenciosamente insegura. Em dev/test o default é permitido.
        if (DEV_DEFAULT_SECRET.equals(secret) && environment.acceptsProfiles(Profiles.of("prod"))) {
            throw new IllegalStateException("JWT_SECRET não configurado: o perfil 'prod' está ativo mas está "
                    + "a ser usado o segredo de desenvolvimento (público). Defina JWT_SECRET "
                    + "(ex.: openssl rand -base64 48) antes de arrancar.");
        }
        this.key = Keys.hmacShaKeyFor(secretBytes);
    }

    /**
     * Access token de uma sessão.
     *
     * @param sessionId id da sessão (claim {@code sid}) usado pelo controlo de
     *                  inatividade do servidor; {@code null} = token sem sessão
     *                  (não sujeito a idle timeout — ver {@code SessionIdleService})
     */
    public String generateToken(UserAccount user, String sessionId) {
        Instant now = Instant.now();
        var builder = Jwts.builder()
                .subject(user.getEmail())
                .claim("uid", user.getId())
                .claim("name", user.getFullName())
                .claim("role", user.getRole())
                .claim("typ", "access")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(props.jwt().expiration())));
        return withSession(builder, sessionId).signWith(key).compact();
    }

    /**
     * Refresh token da mesma sessão. O {@code sid} tem de coincidir com o do
     * access token: no refresh é ele que permite verificar se a sessão ficou
     * ociosa (o refresh token sozinho viveria 30 dias).
     */
    public String generateRefreshToken(UserAccount user, String sessionId) {
        Instant now = Instant.now();
        var builder = Jwts.builder()
                .subject(user.getEmail())
                .claim("uid", user.getId())
                .claim("typ", "refresh")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(props.jwt().refreshExpiration())));
        return withSession(builder, sessionId).signWith(key).compact();
    }

    /** Acrescenta o claim {@code sid} quando existe sessão. */
    private static JwtBuilder withSession(JwtBuilder builder, String sessionId) {
        return sessionId == null || sessionId.isBlank() ? builder : builder.claim("sid", sessionId);
    }

    /** Devolve as claims se o token for válido, senão lança JwtException. */
    public Claims parseClaims(String token) {
        return Jwts.parser().verifyWith(key).build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /** Devolve o email (subject) se o token for válido, senão lança JwtException. */
    public String parseEmail(String token) {
        return parseClaims(token).getSubject();
    }
}
