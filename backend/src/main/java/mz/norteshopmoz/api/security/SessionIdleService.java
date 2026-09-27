package mz.norteshopmoz.api.security;

import java.time.Duration;
import mz.norteshopmoz.api.config.RedisCircuitBreaker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * Inatividade de sessão (idle timeout) verificada no servidor.
 *
 * <p>Antes, o "timeout de sessão" era apenas cosmético: o frontend expirava a
 * interface após 30 minutos ({@code NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES}), mas o
 * cookie do access token continuava válido até 7 dias ({@code JWT_EXPIRATION}) e
 * o servidor não verificava inatividade nenhuma — um cookie roubado valia uma
 * semana. Aqui a janela é imposta do lado do servidor.</p>
 *
 * <p>Como funciona: cada sessão recebe um {@code sid} (claim nos tokens de acesso
 * e de refresh, ver {@code JwtService}). No login/refresh grava-se
 * {@code nsm:auth:idle:<sid>} com TTL igual à janela; em cada pedido autenticado
 * o TTL é renovado. Se a chave já não existir (inatividade superior à janela), a
 * sessão é considerada expirada e o pedido segue como anónimo — mesmo que o JWT
 * ainda não tenha expirado. O {@code /api/auth/refresh} aplica a mesma regra, pelo
 * que o refresh token (30 dias) não revive uma sessão ociosa.</p>
 *
 * <p><strong>Falha aberta</strong>: com o Redis indisponível, a inatividade não
 * pode ser avaliada e a sessão é permitida (com aviso em log). É o mesmo critério
 * do rate limiter, da idempotência e dos refresh tokens: uma dependência em baixo
 * não deve expulsar todos os utilizadores da loja.</p>
 *
 * <p>Tokens sem {@code sid} (emitidos por uma versão anterior, ou clientes de API
 * com {@code Authorization: Bearer}) não passam por este controlo — não se expulsa
 * ninguém numa migração.</p>
 */
@Service
public class SessionIdleService {

    private static final Logger log = LoggerFactory.getLogger(SessionIdleService.class);
    private static final String KEY_PREFIX = "nsm:auth:idle:";

    private final StringRedisTemplate redis;
    private final Duration window;
    private final RedisCircuitBreaker circuitBreaker;

    public SessionIdleService(
            StringRedisTemplate redis,
            RedisCircuitBreaker circuitBreaker,
            @Value("${app.security.session.idle-timeout-minutes:30}") int idleTimeoutMinutes) {
        this.redis = redis;
        this.circuitBreaker = circuitBreaker;
        this.window = Duration.ofMinutes(Math.max(1, idleTimeoutMinutes));
    }

    /** Janela de inatividade configurada (para logs/documentação). */
    public Duration window() {
        return window;
    }

    /** Marca o início da sessão (login/refresh) — a chave existe a partir daqui. */
    public void start(String sessionId) {
        if (isBlank(sessionId)) {
            return;
        }
        try {
            redis.opsForValue().set(key(sessionId), Long.toString(System.currentTimeMillis()), window);
        } catch (Exception e) {
            log.warn("Redis indisponível ao iniciar a sessão {} — inatividade não será medida: {}",
                    sessionId, e.getMessage());
        }
    }

    /**
     * Verifica a inatividade e, se a sessão estiver ativa, renova a janela.
     *
     * <p>Uma só ida ao Redis por pedido ({@code GETEX}): devolve o valor e repõe o
     * TTL atomicamente. {@code null} = chave ausente = sessão ociosa.</p>
     *
     * @return {@code true} se a sessão pode continuar (ativa, sem {@code sid}, ou
     *         Redis indisponível); {@code false} se expirou por inatividade
     */
    public boolean isActiveAndTouch(String sessionId) {
        if (isBlank(sessionId)) {
            return true;
        }
        // Circuito aberto → fail-open sem tocar no Redis: cada request autenticado
        // passa por aqui, pelo que esperar o timeout do Redis em todos eles saturava
        // as threads do Tomcat quando o Redis pendurava (a API morria por latência).
        if (!circuitBreaker.tryAcquire("idle:" + sessionId)) {
            return true;
        }
        try {
            boolean active = redis.opsForValue().getAndExpire(key(sessionId), window) != null;
            circuitBreaker.markSuccess();
            return active;
        } catch (Exception e) {
            logFailure(sessionId, e);
            return true;
        }
    }

    /** Apenas verifica (sem renovar) — usado no refresh, que depois chama {@link #touch}. */
    public boolean isExpired(String sessionId) {
        if (isBlank(sessionId)) {
            return false;
        }
        if (!circuitBreaker.tryAcquire("idle:" + sessionId)) {
            return false;
        }
        try {
            boolean expired = !Boolean.TRUE.equals(redis.hasKey(key(sessionId)));
            circuitBreaker.markSuccess();
            return expired;
        } catch (Exception e) {
            logFailure(sessionId, e);
            return false;
        }
    }

    /** Renova a janela de inatividade (atividade explícita, ex.: refresh). */
    public void touch(String sessionId) {
        if (isBlank(sessionId)) {
            return;
        }
        try {
            redis.expire(key(sessionId), window);
        } catch (Exception e) {
            log.warn("Redis indisponível ao renovar a inatividade da sessão {}: {}", sessionId, e.getMessage());
        }
    }

    /** Termina a sessão (logout) — a chave deixa de existir. */
    public void end(String sessionId) {
        if (isBlank(sessionId)) {
            return;
        }
        try {
            redis.delete(key(sessionId));
        } catch (Exception e) {
            log.warn("Redis indisponível ao terminar a sessão {}: {}", sessionId, e.getMessage());
        }
    }

    private void logFailure(String sessionId, Exception e) {
        boolean justOpened = circuitBreaker.recordFailure(
                "inatividade de sessão: " + e.getMessage());
        if (!justOpened && !circuitBreaker.isOpen()) {
            log.warn("Redis indisponível ao verificar a inatividade da sessão {} — a permitir (fail-open): {}",
                    sessionId, e.getMessage());
        }
    }

    private static String key(String sessionId) {
        return KEY_PREFIX + sessionId;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
