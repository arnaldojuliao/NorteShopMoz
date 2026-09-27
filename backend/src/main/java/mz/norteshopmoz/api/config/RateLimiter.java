package mz.norteshopmoz.api.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Rate limiter de <strong>janela fixa</strong> em Redis.
 *
 * <p>A contagem corre num script Lua atómico — um só round-trip por pedido. O
 * {@code INCR} e o {@code PEXPIRE} acontecem na mesma escrita, pelo que uma chave
 * nunca fica <em>sem TTL</em>: era esse o furo da primeira versão (um
 * {@code zAdd} seguido de um {@code expire} em chamadas distintas), e numa
 * instância {@code noeviction} essas chaves só cresciam até esgotar os 400 MB —
 * altura em que <em>todas</em> as escritas falham (OOM command not allowed) e o
 * rate limit, o bloqueio de brute-force e o idle timeout se desligam em silêncio.</p>
 *
 * <p><strong>Porquê janela fixa e não deslizante:</strong> a versão deslizante
 * guardava <em>um membro do ZSET por pedido</em>. Medido num contentor real:
 * ~54 bytes por membro, e o balde {@code safe} permite 2000 pedidos por minuto e
 * por IP — ou seja até <strong>~108 KB por IP</strong>. Como o IP é a chave do
 * tráfego anónimo, ~3 700 IPs distintos numa janela de 70 segundos enchiam os
 * 400 MB do Redis de estado; com {@code noeviction} isso não descarta chaves,
 * <em>falha</em> — deixando de gravar refresh tokens (utilizadores expulsos) e
 * chaves de idempotência (pedidos duplicados). Ou seja: um scraper com alguns
 * milhares de IPs derrubava a loja pelas próprias defesas. Com um contador por
 * janela, o consumo é O(número de chaves) com ~100 bytes cada — três ordens de
 * grandeza menos no pior caso.</p>
 *
 * <p><strong>Contrapartida aceite:</strong> uma janela fixa admite, no limite
 * entre duas janelas, até 2× o limite em poucos instantes (não há memória do que
 * aconteceu na janela anterior). Para travar abuso e proteger contra brute-force
 * isso é irrelevante; era o preço de o limitador não poder esgotar o Redis.</p>
 *
 * <p>Falha aberta: com o Redis indisponível, o pedido é deixado passar com um
 * aviso (via {@link RedisCircuitBreaker}) — o rate limit nunca é o ponto único de
 * falha da loja.</p>
 */
@Service
public class RateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RateLimiter.class);

    /**
     * Janela fixa, tudo num só script:
     * KEYS[1] = chave, ARGV[1] = limite, ARGV[2] = janela (ms).
     * Devolve { permitido (0/1), contagem, retryAfterSeconds }.
     */
    private static final String FIXED_WINDOW_LUA = """
            local key = KEYS[1]
            local limit = tonumber(ARGV[1])
            local window = tonumber(ARGV[2])

            local current = redis.call('INCR', key)
            if current == 1 then
                redis.call('PEXPIRE', key, window)
            end

            if current > limit then
                local ttl = redis.call('PTTL', key)
                if ttl < 1 then
                    -- Chave sem TTL (não deveria acontecer com o PEXPIRE acima):
                    -- repõe a janela em vez de deixar um bloqueio permanente.
                    redis.call('PEXPIRE', key, window)
                    ttl = window
                end
                return {0, current, math.max(1, math.ceil(ttl / 1000))}
            end
            return {1, current, 0}
            """;

    private static final DefaultRedisScript<List> FIXED_WINDOW_SCRIPT =
            new DefaultRedisScript<>(FIXED_WINDOW_LUA, List.class);

    private final StringRedisTemplate redis;
    private final RateLimitProperties props;
    private final RedisCircuitBreaker circuitBreaker;

    public RateLimiter(StringRedisTemplate redis, RateLimitProperties props, RedisCircuitBreaker circuitBreaker) {
        this.redis = redis;
        this.props = props;
        this.circuitBreaker = circuitBreaker;
    }

    /**
     * Verifica se a requisição deve ser permitida.
     *
     * @param key        Identificador único (ex.: IP, userId, "login:ip")
     * @param configName Nome da configuração (ex.: "auth", "api", "default")
     * @return RateLimitResult com permitido/limitado + headers informativos
     */
    public RateLimitResult tryAcquire(String key, String configName) {
        if (!props.isEnabled()) {
            return RateLimitResult.allowed(0, 0, 0);
        }

        RateLimitProperties.LimitConfig config = props.getEndpoints().getOrDefault(configName,
                props.getEndpoints().get("default"));

        if (config == null) {
            return RateLimitResult.allowed(0, 0, 0);
        }

        // Enquanto o Redis estiver em baixo (janela do circuit breaker ativa),
        // falha aberta SEM tocar no Redis — zero latência acrescida por pedido.
        if (!circuitBreaker.tryAcquire("ratelimit:" + configName + ":" + key)) {
            return RateLimitResult.allowed(0, config.getMaxRequests(), config.getWindowSeconds());
        }

        String redisKey = config.getKeyPrefix() + ":" + configName + ":" + key;
        long windowMs = (long) config.getWindowSeconds() * 1000;

        try {
            List<Long> result = redis.execute(FIXED_WINDOW_SCRIPT,
                    List.of(redisKey),
                    String.valueOf(config.getMaxRequests()),
                    String.valueOf(windowMs));

            if (result == null || result.size() < 3) {
                // Resposta inesperada — trata como permitido (fail-open) sem bloquear a loja.
                log.warn("Rate limit: resposta inesperada do script Lua para '{}' [{}]", key, configName);
                circuitBreaker.markSuccess();
                return RateLimitResult.allowed(1, config.getMaxRequests(), config.getWindowSeconds());
            }

            circuitBreaker.markSuccess();

            boolean allowed = ((Number) result.get(0)).longValue() == 1L;
            int current = ((Number) result.get(1)).intValue();
            if (allowed) {
                return RateLimitResult.allowed(current, config.getMaxRequests(), config.getWindowSeconds());
            }
            int retryAfter = Math.max(1, ((Number) result.get(2)).intValue());
            return RateLimitResult.limited(current, config.getMaxRequests(), retryAfter);
        } catch (RuntimeException e) {
            boolean open = circuitBreaker.recordFailure(
                    "Rate limit indisponível (Redis) para '" + key + "' [" + configName + "]: " + e.getMessage());
            if (!open) {
                log.warn("Rate limit indisponível (Redis) para '{}' [{}]: {} — pedido deixado passar (fail-open).",
                        key, configName, e.getMessage());
            }
            return RateLimitResult.allowed(0, config.getMaxRequests(), config.getWindowSeconds());
        }
    }

    public record RateLimitResult(
            boolean allowed,
            int current,
            int limit,
            int retryAfterSeconds,
            int resetSeconds
    ) {
        public static RateLimitResult allowed(int current, int limit, int resetSeconds) {
            return new RateLimitResult(true, current, limit, 0, resetSeconds);
        }

        public static RateLimitResult limited(int current, int limit, int retryAfterSeconds) {
            return new RateLimitResult(false, current, limit, retryAfterSeconds, retryAfterSeconds);
        }
    }
}
