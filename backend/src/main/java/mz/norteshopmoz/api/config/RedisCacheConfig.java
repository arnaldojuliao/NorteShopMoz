package mz.norteshopmoz.api.config;

import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.jsontype.BasicPolymorphicTypeValidator;
import com.fasterxml.jackson.databind.jsontype.PolymorphicTypeValidator;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.annotation.PreDestroy;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.cache.interceptor.LoggingCacheErrorHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.RedisPassword;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;

/**
 * Cache Redis para o catálogo (products, product, categories, reviews).
 * TTL de 15 minutos — o catálogo é leitura pesada e muda pouco.
 *
 * <p>O serializer usa um {@link ObjectMapper} próprio que replica exatamente a
 * configuração padrão do {@link GenericJackson2JsonRedisSerializer}
 * ({@code DefaultTyping.EVERYTHING} + {@code As.PROPERTY} com hint {@code @class})
 * e regista ainda o {@link JavaTimeModule} — sem ele, entidades com campos
 * {@link java.time.Instant} (ex.: {@code Review.date}) falham ao ser guardadas.
 *
 * <p>Ao contrário do padrão (que usa {@code LaissezFaireSubTypeValidator}), o
 * polimorfismo é restringido a uma allowlist de pacotes: com o validador
 * permissivo, o {@code @class} presente nos bytes guardados no Redis decide que
 * classe é instanciada na desserialização — o padrão clássico de gadget de
 * execução remota se alguém conseguir escrever no Redis. O formato guardado é
 * idêntico (as entradas existentes continuam válidas), só a leitura é validada.
 */
@Configuration
@EnableCaching
public class RedisCacheConfig implements CachingConfigurer {

    /**
     * Conexões Redis criadas por esta configuração quando a cache tem uma
     * instância dedicada. Fechadas no shutdown (não são beans Spring, para não
     * colidir com o {@code redisConnectionFactory} padrão usado por sessões,
     * rate limit e idempotência).
     */
    private final List<LettuceConnectionFactory> ownedConnections = new ArrayList<>();

    /**
     * Namespace das chaves de cache.
     *
     * <p>Duas instâncias da API que partilhem o mesmo Redis mas apontem para
     * bases de dados diferentes (ex.: uma contra o Postgres de dev e outra
     * contra a H2 do perfil de testes) escreviam nas <em>mesmas</em> chaves —
     * `products::…` — e o catálogo de uma aparecia na outra. O prefixo passa a
     * incluir um resumo do {@code spring.datasource.url}, pelo que bases de
     * dados distintas nunca partilham entradas.
     */
    private static String cacheNamespace(String datasourceUrl) {
        String source = datasourceUrl == null ? "" : datasourceUrl.trim().toLowerCase();
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(source.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (int i = 0; i < 4; i++) {
                hex.append(String.format("%02x", digest[i]));
            }
            return "nsm:" + hex + ":";
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 existe em qualquer JVM; por segurança usa-se um namespace
            // único em vez de arriscar partilhar chaves entre bases de dados.
            return "nsm:" + Integer.toHexString(source.hashCode()) + ":";
        }
    }

    /**
     * Cache Redis do catálogo.
     *
     * <p>Por omissão usa a mesma instância do restante estado (dev/testes). Em
     * produção definem-se {@code app.cache.redis.host/port/password} para uma
     * <strong>instância dedicada</strong>: a cache pode então usar
     * {@code allkeys-lru} (evicta livremente sob pressão) enquanto a instância
     * do estado (refresh tokens, idempotência, rate limit) fica em
     * {@code noeviction}. Sem esta separação, uma única política de evição
     * servia cache e sessões, e o cache a encher a memória podia impedir a
     * escrita de tokens ou descartá-los.</p>
     */
    @Bean
    public RedisCacheManager cacheManager(
            RedisConnectionFactory connectionFactory,
            @Value("${spring.datasource.url:}") String datasourceUrl,
            @Value("${app.cache.redis.host:}") String cacheHost,
            @Value("${app.cache.redis.port:0}") int cachePort,
            @Value("${app.cache.redis.password:}") String cachePassword,
            @Value("${app.cache.redis.database:-1}") int cacheDatabase) {
        RedisConnectionFactory cacheConnection = dedicatedCacheConnection(
                connectionFactory, cacheHost, cachePort, cachePassword, cacheDatabase);
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        mapper.activateDefaultTyping(
                allowedTypes(),
                ObjectMapper.DefaultTyping.EVERYTHING,
                JsonTypeInfo.As.PROPERTY);
        GenericJackson2JsonRedisSerializer.registerNullValueSerializer(mapper, null);
        GenericJackson2JsonRedisSerializer serializer = new GenericJackson2JsonRedisSerializer(mapper);

        String namespace = cacheNamespace(datasourceUrl);
        RedisCacheConfiguration defaults = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(15))
                .disableCachingNullValues()
                .computePrefixWith(cacheName -> namespace + cacheName + "::")
                .serializeValuesWith(RedisSerializationContext.SerializationPair
                        .fromSerializer(serializer));

        return RedisCacheManager.builder(cacheConnection)
                .cacheDefaults(defaults)
                .build();
    }

    /**
     * Tratamento de falhas da cache: <strong>falha aberta (fail-open)</strong>.
     *
     * <p>Sem isto o Spring usa o {@link org.springframework.cache.interceptor.SimpleCacheErrorHandler}
     * por omissão, que <em>relança</em> a exceção: com o Redis da cache em baixo
     * (ou uma entrada que falhe a desserializar), TODOS os endpoints de catálogo
     * (produtos, categorias, avaliações) respondiam 500 — e o healthcheck do
     * contentor usa o liveness, que não vê o Redis, pelo que a loja ficava
     * "saudável" com o catálogo morto.</p>
     *
     * <p>A cache do catálogo é descartável: uma falha é tratada como cache miss,
     * a query vai à base de dados e o resultado volta a ser guardado. O
     * incidente fica registado em WARN (com stack trace).</p>
     */
    @Override
    public CacheErrorHandler errorHandler() {
        return new LoggingCacheErrorHandler(true);
    }

    /**
     * Devolve a conexão da cache: a instância dedicada (quando
     * {@code app.cache.redis.host} está definido) ou a conexão padrão.
     */
    private RedisConnectionFactory dedicatedCacheConnection(
            RedisConnectionFactory fallback,
            String host, int port, String password, int database) {
        if (host == null || host.isBlank()) {
            return fallback;
        }
        RedisStandaloneConfiguration config = new RedisStandaloneConfiguration(
                host, port > 0 ? port : 6379);
        if (password != null && !password.isBlank()) {
            config.setPassword(RedisPassword.of(password));
        }
        if (database >= 0) {
            config.setDatabase(database);
        }
        LettuceConnectionFactory connection = new LettuceConnectionFactory(config);
        connection.afterPropertiesSet();
        ownedConnections.add(connection);
        return connection;
    }

    @PreDestroy
    void closeDedicatedCacheConnections() {
        for (LettuceConnectionFactory connection : ownedConnections) {
            connection.destroy();
        }
        ownedConnections.clear();
    }

    /**
     * Allowlist de pacotes para o {@code @class} do JSON em cache: as entidades
     * da aplicação e os tipos de coleção/data/valor que o catálogo usa.
     * Qualquer outro tipo é rejeitado na desserialização.
     */
    private static PolymorphicTypeValidator allowedTypes() {
        return BasicPolymorphicTypeValidator.builder()
                .allowIfSubType("mz.norteshopmoz.api.")
                .allowIfSubType("java.util.")
                .allowIfSubType("java.time.")
                .allowIfSubType("java.math.")
                .allowIfSubType("java.lang.")
                .build();
    }
}
