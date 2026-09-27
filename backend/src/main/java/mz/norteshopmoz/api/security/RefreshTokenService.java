package mz.norteshopmoz.api.security;

import mz.norteshopmoz.api.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.List;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

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

    /**
     * Rotação atómica: remove o token antigo, adiciona o novo e repõe o TTL num
     * só script. Antes eram três chamadas separadas; uma falha entre o
     * {@code remove} e o {@code add} deixava o utilizador sem refresh token
     * nenhum (logout inesperado).
     */
    private static final String ROTATE_LUA = """
            redis.call('SREM', KEYS[1], ARGV[1])
            redis.call('SADD', KEYS[1], ARGV[2])
            redis.call('PEXPIRE', KEYS[1], ARGV[3])
            return 1
            """;

    private static final DefaultRedisScript<Long> ROTATE_SCRIPT =
            new DefaultRedisScript<>(ROTATE_LUA, Long.class);

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

    /**
     * Verifica se o refresh token existe e é válido para o utilizador.
     *
     * <p><strong>Falha aberta</strong> (devolve {@code true}) quando o Redis está
     * indisponível. Antes devolvia {@code false}, o que transformava uma falha do
     * Redis num logout em massa: nenhuma sessão conseguia renovar e todos os
     * utilizadores eram expulsos de uma vez. A decisão é segura porque o token
     * já foi verificado criptograficamente antes desta chamada (assinatura +
     * expiração, em {@code AuthService.refreshToken}) — o Redis só serve para
     * detetar tokens revogados/rotacionados. Numa janela de indisponibilidade,
     * aceitar um token assinado válido é preferível a derrubar a loja toda; a
     * indisponibilidade fica registada em log para alerta.</p>
     */
    public boolean isValid(String userId, String refreshToken) {
        try {
            String key = KEY_PREFIX + userId;
            Boolean exists = redis.opsForSet().isMember(key, refreshToken);
            return Boolean.TRUE.equals(exists);
        } catch (Exception e) {
            log.warn("Redis indisponível ao validar o refresh token de {} — a permitir (fail-open): {}",
                    userId, e.getMessage());
            return true;
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

    /** Rotação: remove o token antigo e guarda o novo atomicamente (script Lua). */
    public void rotate(String userId, String oldToken, String newToken) {
        try {
            String key = KEY_PREFIX + userId;
            redis.execute(ROTATE_SCRIPT, List.of(key), oldToken, newToken,
                    String.valueOf(props.jwt().refreshExpiration().toMillis()));
        } catch (Exception e) {
            log.warn("Não foi possível rotacionar refresh token do utilizador {}: {}", userId, e.getMessage());
        }
    }
}