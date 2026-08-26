package mz.norteshopmoz.api.security;

import mz.norteshopmoz.api.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * Revogação de sessões JWT via Redis (corte de {@code iat}).
 *
 * <p>Os tokens são stateless e não há registo dos emitidos, por isso ao repor a
 * palavra-passe guarda-se o instante da reposição por utilizador; qualquer token
 * emitido <em>antes</em> desse instante passa a ser rejeitado no filtro JWT.
 * A chave expira após a vida útil máxima de um token ({@code app.jwt.expiration-seconds}),
 * evitando acumulação no Redis.
 *
 * <p>Falha aberta: se o Redis estiver indisponível, a verificação não bloqueia o
 * acesso (apenas avisa) — consistente com a filosofia de nunca bloquear a loja.
 */
@Service
public class SessionRevocationService {

    private static final Logger log = LoggerFactory.getLogger(SessionRevocationService.class);
    private static final String KEY_PREFIX = "nsm:auth:revoked:";

    private final StringRedisTemplate redis;
    private final AppProperties props;

    public SessionRevocationService(StringRedisTemplate redis, AppProperties props) {
        this.redis = redis;
        this.props = props;
    }

    /** Invalida todos os tokens emitidos antes de agora para este utilizador. */
    public void revokeAll(String userId) {
        try {
            redis.opsForValue().set(
                    KEY_PREFIX + userId,
                    String.valueOf(System.currentTimeMillis()),
                    props.jwt().expiration());
        } catch (Exception e) {
            log.warn("Não foi possível registar a revogação de sessões do utilizador {}: {}",
                    userId, e.getMessage());
        }
    }

    /** true se o token (emitido em {@code issuedAtMillis}) foi revogado. */
    public boolean isRevoked(String userId, long issuedAtMillis) {
        try {
            String raw = redis.opsForValue().get(KEY_PREFIX + userId);
            if (raw == null) {
                return false;
            }
            long revokedAt = Long.parseLong(raw);
            return issuedAtMillis < revokedAt;
        } catch (Exception e) {
            log.warn("Verificação de revogação indisponível para {}: {}", userId, e.getMessage());
            return false;
        }
    }
}
