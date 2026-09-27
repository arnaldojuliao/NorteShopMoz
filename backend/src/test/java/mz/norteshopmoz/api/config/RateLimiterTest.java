package mz.norteshopmoz.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

/**
 * O rate limit não pode derrubar a loja quando o Redis está indisponível:
 * falha aberta (deixa passar e regista aviso) em vez de 500 em cada pedido.
 *
 * <p>A contagem corre num script Lua atômico (1 round-trip; TTL definido dentro
 * da mesma escrita — sem fugas de chaves sem TTL na instância noeviction). Os
 * testes mockam {@code redis.execute(script, keys, args)}.</p>
 */
class RateLimiterTest {

    private static RateLimitProperties props(String name, int maxRequests) {
        RateLimitProperties.LimitConfig config = new RateLimitProperties.LimitConfig();
        config.setMaxRequests(maxRequests);
        config.setWindowSeconds(60);
        config.setKeyPrefix("ratelimit");
        RateLimitProperties props = new RateLimitProperties();
        props.setEndpoints(Map.of(name, config));
        return props;
    }

    @SuppressWarnings("unchecked")
    private static void scriptReturns(StringRedisTemplate redis, List<Long> value) {
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class))).thenReturn(value);
    }

    @Test
    @SuppressWarnings("unchecked")
    void permitePedidoDentroDoLimite() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        scriptReturns(redis, List.of(1L, 1L, 0L));

        RateLimiter limiter = new RateLimiter(redis, props("api", 5), new RedisCircuitBreaker());

        RateLimiter.RateLimitResult result = limiter.tryAcquire("api:1.2.3.4", "api");

        assertThat(result.allowed()).isTrue();
        assertThat(result.limit()).isEqualTo(5);
    }

    @Test
    @SuppressWarnings("unchecked")
    void bloqueiaAcimaDoLimite() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        // Script devolve {0, count, retryAfterSeconds}.
        scriptReturns(redis, List.of(0L, 5L, 12L));

        RateLimiter limiter = new RateLimiter(redis, props("api", 5), new RedisCircuitBreaker());

        RateLimiter.RateLimitResult result = limiter.tryAcquire("api:1.2.3.4", "api");

        assertThat(result.allowed()).isFalse();
        assertThat(result.retryAfterSeconds()).isPositive();
    }

    @Test
    @SuppressWarnings("unchecked")
    void redisIndisponivelFalhaAberta() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
                .thenThrow(new RedisConnectionFailureException("Redis em baixo"));

        RateLimiter limiter = new RateLimiter(redis, props("api", 5), new RedisCircuitBreaker());

        // Não lança: devolve permitido, para a API continuar a servir.
        RateLimiter.RateLimitResult result = limiter.tryAcquire("api:1.2.3.4", "api");

        assertThat(result.allowed()).isTrue();
    }

    @Test
    @SuppressWarnings("unchecked")
    void circuitoAbertoNemTocaNoRedis() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
                .thenThrow(new RedisConnectionFailureException("Redis em baixo"));

        RedisCircuitBreaker breaker = new RedisCircuitBreaker();
        RateLimiter limiter = new RateLimiter(redis, props("api", 5), breaker);

        // Esgota o limiar de falhas para abrir o circuito.
        for (int i = 0; i < 5; i++) {
            limiter.tryAcquire("api:1.2.3.4", "api");
        }
        assertThat(breaker.isOpen()).isTrue();

        // Com o circuito aberto, já não há chamada ao Redis — e mesmo assim falha aberto.
        org.mockito.Mockito.reset(redis);
        RateLimiter.RateLimitResult result = limiter.tryAcquire("api:1.2.3.4", "api");

        assertThat(result.allowed()).isTrue();
        org.mockito.Mockito.verify(redis, org.mockito.Mockito.never())
                .execute(any(RedisScript.class), anyList(), any(Object[].class));
    }
}
