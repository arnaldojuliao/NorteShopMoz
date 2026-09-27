package mz.norteshopmoz.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import mz.norteshopmoz.api.config.RedisCircuitBreaker;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

/**
 * Controlo de inatividade de sessão (o "timeout de sessão" que antes só existia
 * no cliente). O que importa garantir: a chave ausente expira a sessão, e uma
 * falha do Redis <strong>não</strong> expulsa ninguém (fail-open).
 */
class SessionIdleServiceTest {

    private static final String SID = "sessao-123";
    private static final String KEY = "nsm:auth:idle:" + SID;
    private static final Duration WINDOW = Duration.ofMinutes(30);

    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final ValueOperations<String, String> values = mockValueOps();
    private final SessionIdleService service = new SessionIdleService(redis, new RedisCircuitBreaker(), 30);

    @SuppressWarnings("unchecked")
    private ValueOperations<String, String> mockValueOps() {
        ValueOperations<String, String> ops = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(ops);
        return ops;
    }

    @Test
    void janelaConfiguradaEhAMesmaQueOTtlEscrito() throws Exception {
        assertThat(service.window()).isEqualTo(WINDOW);

        service.start(SID);

        verify(values).set(eq(KEY), any(String.class), eq(WINDOW));
    }

    @Test
    void sessaoAtivaEhPermitidaERenovaAJanela() {
        when(values.getAndExpire(KEY, WINDOW)).thenReturn("1700000000000");

        assertThat(service.isActiveAndTouch(SID)).isTrue();
    }

    @Test
    void sessaoOciosaEhRejeitada() {
        // Chave já expirou por inatividade → GETEX devolve null.
        when(values.getAndExpire(KEY, WINDOW)).thenReturn(null);

        assertThat(service.isActiveAndTouch(SID)).isFalse();
    }

    @Test
    void redisIndisponivelFalhaAberto() {
        when(values.getAndExpire(KEY, WINDOW)).thenThrow(new RuntimeException("connection refused"));

        assertThat(service.isActiveAndTouch(SID))
                .as("uma indisponibilidade do Redis não pode expulsar todos os utilizadores")
                .isTrue();
    }

    @Test
    void semSidNaoHaControloDeInatividade() {
        // Tokens emitidos antes deste controlo (ou clientes com Bearer) não têm sid.
        assertThat(service.isActiveAndTouch(null)).isTrue();
        assertThat(service.isActiveAndTouch("")).isTrue();
        assertThat(service.isExpired(null)).isFalse();
    }

    @Test
    void isExpiredDetetaAChaveAusente() {
        when(redis.hasKey(KEY)).thenReturn(true);
        assertThat(service.isExpired(SID)).isFalse();

        when(redis.hasKey(KEY)).thenReturn(false);
        assertThat(service.isExpired(SID)).isTrue();
    }

    @Test
    void isExpiredFalhaAbertoComORedisEmBaixo() {
        when(redis.hasKey(KEY)).thenThrow(new RuntimeException("timeout"));

        assertThat(service.isExpired(SID)).isFalse();
    }

    @Test
    void logoutApagaAChave() {
        service.end(SID);

        verify(redis).delete(KEY);
    }

    @Test
    void janelaMinimaDeUmMinuto() {
        assertThat(new SessionIdleService(redis, new RedisCircuitBreaker(), 0).window())
                .isEqualTo(Duration.ofMinutes(1));
    }
}
