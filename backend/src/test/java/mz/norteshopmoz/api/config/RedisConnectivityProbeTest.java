package mz.norteshopmoz.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import io.lettuce.core.RedisConnectionException;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * Sonda de conectividade ao Redis. O que importa garantir: distingue «o nome não
 * resolve» (contentor fora da rede) de «resolve mas não responde» — a correção é
 * diferente —, e nunca propaga a exceção (a loja degrada, não morre).
 */
class RedisConnectivityProbeTest {

    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);

    @SuppressWarnings("unchecked")
    private void pingReturns(String value) {
        when(redis.execute(any(RedisCallback.class))).thenReturn(value);
    }

    @SuppressWarnings("unchecked")
    private void pingThrows(RuntimeException error) {
        when(redis.execute(any(RedisCallback.class))).thenThrow(error);
    }

    @Test
    void redisSaudavelNaoTemProblema() {
        pingReturns("PONG");
        RedisConnectivityProbe probe = new RedisConnectivityProbe(redis, "localhost", 6381);

        assertThat(probe.diagnose()).isNull();
    }

    @Test
    void redisQueRespondeVazioEUmProblema() {
        pingReturns(null);
        RedisConnectivityProbe probe = new RedisConnectivityProbe(redis, "localhost", 6381);

        assertThat(probe.diagnose()).contains("PING");
    }

    @Test
    void redisQueNaoAceitaLigacoesTemDiagnosticoProprio() {
        pingThrows(new RedisConnectionException("Unable to connect to redis/localhost:6381"));
        RedisConnectivityProbe probe = new RedisConnectivityProbe(redis, "localhost", 6381);

        assertThat(probe.diagnose()).contains("resolve mas não aceita ligações");
    }

    /**
     * O caso do incidente: o contentor do Redis a correr sem endpoint de rede. O
     * diagnóstico tem de apontar para o problema de rede — não para «Redis em
     * baixo» — porque a correção é reconectar o contentor com o alias.
     */
    @Test
    void nomeQueNaoResolveApontaParaOContentorForaDaRede() {
        RedisConnectivityProbe probe = new RedisConnectivityProbe(
                redis, "redis-de-teste-inexistente.invalid", 6379);

        assertThat(probe.diagnose()).startsWith("o nome").contains("não se resolve");
    }

    /** Uma falha nunca pode escapar da sonda: o arranque tem de continuar. */
    @Test
    void sondaDoArranqueNuncaLancaEDegrada() {
        pingThrows(new RedisConnectionException("Unable to connect to redis/localhost:6381"));
        RedisConnectivityProbe probe = new RedisConnectivityProbe(redis, "localhost", 6381);

        probe.probeOnStartup();

        assertThat(probe.isReachable()).isFalse();
    }
}
