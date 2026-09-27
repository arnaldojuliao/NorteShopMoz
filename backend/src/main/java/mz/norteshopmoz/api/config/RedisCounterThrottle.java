package mz.norteshopmoz.api.config;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

/**
 * Contadores com janela e TTL no Redis — encanamento partilhado dos travões que
 * protegem o checkout público e os endpoints que enviam email.
 *
 * <p><strong>Um round-trip, chave com TTL garantido.</strong> O {@code INCR} e o
 * {@code PEXPIRE} correm no mesmo script Lua. O padrão alternativo ({@code INCR}
 * e, numa segunda chamada, {@code EXPIRE}) deixa — se algo falhar pelo meio — uma
 * chave <em>sem TTL para sempre</em>; na instância de estado
 * ({@code noeviction}) essas chaves só crescem até esgotar a memória, e aí todas
 * as escritas falham (tokens de sessão incluídos).</p>
 *
 * <p><strong>Falha aberta e isolada por circuito.</strong> Cada operação passa
 * pelo {@link RedisCircuitBreaker}: com o Redis pendurado, as chamadas seguintes
 * falham abertas <em>sem tocar no Redis</em> (em vez de pagarem o timeout em cada
 * pedido). Uma falha é registada uma vez, com o contexto de quem a sofreu.</p>
 *
 * <p><strong>Privacidade:</strong> {@link #digest(String)} resume o
 * identificador (email/telefone) a 16 caracteres hexadecimais. Uma chave de
 * contador não é sítio para dados pessoais — um {@code MONITOR}, um {@code RDB}
 * ou um {@code SCAN} não devem revelar quem tentou o quê.</p>
 */
@Component
public class RedisCounterThrottle {

    private static final Logger log = LoggerFactory.getLogger(RedisCounterThrottle.class);

    /**
     * KEYS[1] = chave, ARGV[1] = TTL em ms. Devolve o valor após o incremento.
     */
    private static final String INCR_WINDOW_LUA = """
            local n = redis.call('INCR', KEYS[1])
            if n == 1 then
                redis.call('PEXPIRE', KEYS[1], ARGV[1])
            end
            return n
            """;

    private static final DefaultRedisScript<Long> INCR_WINDOW =
            new DefaultRedisScript<>(INCR_WINDOW_LUA, Long.class);

    private final StringRedisTemplate redis;
    private final RedisCircuitBreaker circuitBreaker;

    public RedisCounterThrottle(StringRedisTemplate redis, RedisCircuitBreaker circuitBreaker) {
        this.redis = redis;
        this.circuitBreaker = circuitBreaker;
    }

    /**
     * Valor atual do contador.
     *
     * @param scope descrição usada nos logs (ex.: «travão do checkout»)
     * @return o valor, ou {@code 0} quando a chave não existe, o circuito está
     *         aberto ou o Redis falhou (0 nunca bloqueia — falha aberta)
     */
    public long read(String key, String scope) {
        if (!circuitBreaker.tryAcquire(key)) {
            return 0;
        }
        try {
            String value = redis.opsForValue().get(key);
            circuitBreaker.markSuccess();
            return parse(value);
        } catch (RuntimeException e) {
            failOpen(scope, e);
            return 0;
        }
    }

    /**
     * Incrementa o contador (e define o TTL na primeira escrita).
     *
     * <p>Best-effort: uma falha é registada e engolida. O trabalho de quem chama
     * já está feito — perder uma unidade do contador é preferível a falhar a
     * operação por causa dele.</p>
     */
    public void increment(String key, Duration ttl, String scope) {
        if (!circuitBreaker.tryAcquire(key)) {
            return;
        }
        try {
            redis.execute(INCR_WINDOW, List.of(key), String.valueOf(ttl.toMillis()));
            circuitBreaker.markSuccess();
        } catch (RuntimeException e) {
            failOpen(scope, e);
        }
    }

    /**
     * Resumo hexadecimal (16 caracteres) de um identificador, para usar em chaves.
     *
     * @return {@code null} se não houver identificador ou se o algoritmo não
     *         existir na JVM (nesse caso o limite por identificador é desligado em
     *         vez de derrubar a operação)
     */
    public static String digest(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (int i = 0; i < 8; i++) {
                hex.append(String.format("%02x", hash[i]));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            return null;
        }
    }

    private static long parse(String value) {
        if (value == null || value.isBlank()) {
            return 0;
        }
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private void failOpen(String scope, RuntimeException e) {
        boolean justOpened = circuitBreaker.recordFailure(scope + ": " + e.getMessage());
        if (!justOpened && !circuitBreaker.isOpen()) {
            log.warn("{} indisponível (Redis): {} — pedido deixado passar (fail-open).",
                    scope, e.getMessage());
        }
    }
}
