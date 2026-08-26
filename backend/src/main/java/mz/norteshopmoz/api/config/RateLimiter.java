package mz.norteshopmoz.api.config;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Set;

/**
 * Rate limiter baseado em sliding window usando Redis.
 * <p>
 * Armazena timestamps das requisições em sorted set (ZSET) no Redis.
 * A chave expira automaticamente após a janela + buffer.
 */
@Service
public class RateLimiter {

    private final StringRedisTemplate redis;
    private final RateLimitProperties props;

    public RateLimiter(StringRedisTemplate redis, RateLimitProperties props) {
        this.redis = redis;
        this.props = props;
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

        String redisKey = config.getKeyPrefix() + ":" + configName + ":" + key;
        long now = Instant.now().toEpochMilli();
        long windowMs = (long) config.getWindowSeconds() * 1000;
        long windowStart = now - windowMs;

        // Remove entradas antigas (fora da janela)
        redis.opsForZSet().removeRangeByScore(redisKey, 0, windowStart);

        // Conta requisições na janela atual
        Long currentCount = redis.opsForZSet().zCard(redisKey);
        int current = currentCount != null ? currentCount.intValue() : 0;

        if (current >= config.getMaxRequests()) {
            // Rate limit excedido - obtém o timestamp mais antigo para calcular retry-after
            Set<String> oldest = redis.opsForZSet().range(redisKey, 0, 0);
            long retryAfter = config.getWindowSeconds();
            if (!oldest.isEmpty()) {
                try {
                    long oldestTs = Long.parseLong(oldest.iterator().next());
                    retryAfter = Math.max(1, (oldestTs + windowMs - now) / 1000);
                } catch (NumberFormatException ignored) {
                }
            }
            return RateLimitResult.limited(current, config.getMaxRequests(), (int) retryAfter);
        }

        // Adiciona timestamp atual
        redis.opsForZSet().add(redisKey, String.valueOf(now), now);
        // Define TTL ligeiramente maior que a janela para limpeza automática
        redis.expire(redisKey, java.time.Duration.ofSeconds(config.getWindowSeconds() + 10));

        return RateLimitResult.allowed(current + 1, config.getMaxRequests(), config.getWindowSeconds());
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