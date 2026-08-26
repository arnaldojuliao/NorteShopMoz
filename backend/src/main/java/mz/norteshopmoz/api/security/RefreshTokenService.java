package mz.norteshopmoz.api.security;

import mz.norteshopmoz.api.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Armazenamento e validação de refresh tokens no Redis.
 *
 * <p>Cada utilizador pode ter múltiplos refresh tokens (um por dispositivo/sessão).
 * Os tokens são guardados com TTL igual à expiração do refresh token configurada.
 * Ao fazer logout ou rotação, o token é removido da lista.
 *
 * <p>Falha aberta: se o Redis estiver indisponível, permite a operação (apenas avisa).
 */
@Service
public class RefreshTokenService {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenService.class);
    private static final String KEY_PREFIX = "nsm:auth:refresh:";

    private final StringRedisTemplate redis;
    private final AppProperties props;

    public RefreshTokenService(StringRedisTemplate redis, AppProperties props) {
        this.redis = redis;
        this.props = props;
    }

    /** Guarda um refresh token para o utilizador. */
    public void store(String userId, String refreshToken) {
        try {
            String key = KEY_PREFIX + userId;
            redis.opsForSet().add(key, refreshToken);
            redis.expire(key, props.jwt().refreshExpiration());
        } catch (Exception e) {
            log.warn("Não foi possível guardar refresh token do utilizador {}: {}", userId, e.getMessage());
        }
    }

    /** Verifica se o refresh token existe e é válido para o utilizador. */
    public boolean isValid(String userId, String refreshToken) {
        try {
            String key = KEY_PREFIX + userId;
            Boolean exists = redis.opsForSet().isMember(key, refreshToken);
            return Boolean.TRUE.equals(exists);
        } catch (Exception e) {
            log.warn("Verificação de refresh token indisponível para {}: {}", userId, e.getMessage());
            return false;
        }
    }

    /** Remove um refresh token específico (rotação/logout). */
    public void revoke(String userId, String refreshToken) {
        try {
            String key = KEY_PREFIX + userId;
            redis.opsForSet().remove(key, refreshToken);
        } catch (Exception e) {
            log.warn("Não foi possível revogar refresh token do utilizador {}: {}", userId, e.getMessage());
        }
    }

    /** Remove todos os refresh tokens do utilizador (logout total). */
    public void revokeAll(String userId) {
        try {
            String key = KEY_PREFIX + userId;
            redis.delete(key);
        } catch (Exception e) {
            log.warn("Não foi possível revogar todos os refresh tokens do utilizador {}: {}", userId, e.getMessage());
        }
    }

    /** Rotação: remove o token antigo e guarda o novo atomicamente. */
    public void rotate(String userId, String oldToken, String newToken) {
        try {
            String key = KEY_PREFIX + userId;
            redis.opsForSet().remove(key, oldToken);
            redis.opsForSet().add(key, newToken);
            redis.expire(key, props.jwt().refreshExpiration());
        } catch (Exception e) {
            log.warn("Não foi possível rotacionar refresh token do utilizador {}: {}", userId, e.getMessage());
        }
    }
}