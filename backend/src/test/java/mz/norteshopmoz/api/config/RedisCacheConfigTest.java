package mz.norteshopmoz.api.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.springframework.cache.Cache;
import org.springframework.cache.interceptor.CacheErrorHandler;

/**
 * Falha aberta da cache do catálogo.
 *
 * <p>Sem um {@link CacheErrorHandler} próprio, o Spring usa o
 * {@code SimpleCacheErrorHandler} por omissão, que <strong>relança</strong>: com
 * o Redis da cache em baixo (ou uma entrada que falhe a desserializar, ex.: após
 * um deploy que mude as entidades em cache), TODOS os endpoints do catálogo
 * respondiam 500 — e o healthcheck do contentor usa o liveness, que não vê o
 * Redis, pelo que a loja ficava "saudável" com o catálogo morto.</p>
 *
 * <p>A cache é descartável: a falha tem de ser tratada como cache miss para a
 * query ir à base de dados.</p>
 */
class RedisCacheConfigTest {

    @Test
    void falhaDaCacheEhTratadaComoMissEmVezDeDerribarOCatalogo() {
        CacheErrorHandler handler = new RedisCacheConfig().errorHandler();
        Cache cache = mock(Cache.class);
        RuntimeException redisDown = new RuntimeException("Redis connection refused");

        // Nenhuma destas pode propagar — o catálogo tem de continuar a servir.
        assertThatCode(() -> handler.handleCacheGetError(redisDown, cache, "products::all"))
                .doesNotThrowAnyException();
        assertThatCode(() -> handler.handleCachePutError(redisDown, cache, "products::all", "valor"))
                .doesNotThrowAnyException();
        assertThatCode(() -> handler.handleCacheEvictError(redisDown, cache, "products::all"))
                .doesNotThrowAnyException();
        assertThatCode(() -> handler.handleCacheClearError(redisDown, cache))
                .doesNotThrowAnyException();
    }
}
