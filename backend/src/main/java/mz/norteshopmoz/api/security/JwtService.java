package mz.norteshopmoz.api.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import mz.norteshopmoz.api.config.AppProperties;
import mz.norteshopmoz.api.domain.UserAccount;
import org.springframework.stereotype.Service;

/** Emissão e validação de tokens JWT (HS256). */
@Service
public class JwtService {

    private final AppProperties props;
    private final SecretKey key;

    public JwtService(AppProperties props) {
        this.props = props;
        this.key = Keys.hmacShaKeyFor(props.jwt().secret().getBytes(StandardCharsets.UTF_8));
    }

    public String generateToken(UserAccount user) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(user.getEmail())
                .claim("uid", user.getId())
                .claim("name", user.getFullName())
                .claim("typ", "access")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(props.jwt().expiration())))
                .signWith(key)
                .compact();
    }

    public String generateRefreshToken(UserAccount user) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(user.getEmail())
                .claim("uid", user.getId())
                .claim("typ", "refresh")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(props.jwt().refreshExpiration())))
                .signWith(key)
                .compact();
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
