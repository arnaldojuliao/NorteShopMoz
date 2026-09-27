package mz.norteshopmoz.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import mz.norteshopmoz.api.config.RedisCircuitBreaker;
import mz.norteshopmoz.api.config.RedisCounterThrottle;
import mz.norteshopmoz.api.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

/**
 * Travão dos emails de endpoints públicos (ver EmailThrottleService).
 *
 * <p>O que estes testes protegem:</p>
 * <ul>
 *   <li>o teto por <strong>endereço</strong>, para uma caixa de correio não ser
 *       bombardeada (e o mesmo email com maiúsculas ser o mesmo endereço);</li>
 *   <li>o teto <strong>global</strong> — o travão de anomalia que protege a cota
 *       do fornecedor de email;</li>
 *   <li>só conta envios que acontecem: uma tentativa recusada antes do envio não
 *       gasta quota;</li>
 *   <li>com o Redis indisponível o pedido <strong>passa</strong> — a loja não deixa
 *       de registar clientes por causa de um contador acessório.</li>
 * </ul>
 */
class EmailThrottleServiceTest {

    private static final int MAX_PER_ADDRESS = 3;
    private static final int MAX_GLOBAL_PER_HOUR = 150;

    private StringRedisTemplate redis;
    private ValueOperations<String, String> values;
    private RedisCircuitBreaker circuitBreaker;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redis = mock(StringRedisTemplate.class);
        values = mock(ValueOperations.class);
        circuitBreaker = new RedisCircuitBreaker();
        when(redis.opsForValue()).thenReturn(values);
    }

    private EmailThrottleService service() {
        return service(true);
    }

    private EmailThrottleService service(boolean enabled) {
        RedisCounterThrottle counters = new RedisCounterThrottle(redis, circuitBreaker);
        return new EmailThrottleService(counters, enabled, MAX_PER_ADDRESS, 60, MAX_GLOBAL_PER_HOUR);
    }

    private List<String> readKeys() {
        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(values, org.mockito.Mockito.atLeastOnce()).get(captor.capture());
        return captor.getAllValues();
    }

    @Test
    void primeiroEnvioPassa() {
        when(values.get(anyString())).thenReturn(null);

        assertThatCode(() -> service().assertAllowed("cliente@exemplo.mz"))
                .doesNotThrowAnyException();
    }

    @Test
    void recusaAoAtingirOTetoPorEndereco() {
        when(values.get(anyString())).thenReturn(String.valueOf(MAX_PER_ADDRESS));

        assertThatThrownBy(() -> service().assertAllowed("cliente@exemplo.mz"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Já pedimos vários emails");
    }

    @Test
    void oMesmoEmailComMaiusculasContaComoOMesmoEndereco() {
        when(values.get(anyString())).thenReturn(null);

        service().assertAllowed("Cliente@Exemplo.MZ");
        String primeira = readKeys().stream().filter(k -> k.startsWith("nsm:mail:addr:")).findFirst()
                .orElseThrow();

        org.mockito.Mockito.reset(values);
        when(values.get(anyString())).thenReturn(null);
        service().assertAllowed("cliente@exemplo.mz");
        String segunda = readKeys().stream().filter(k -> k.startsWith("nsm:mail:addr:")).findFirst()
                .orElseThrow();

        assertThat(segunda).isEqualTo(primeira);
    }

    @Test
    void aChaveNaoContemOEmailEmClaro() {
        when(values.get(anyString())).thenReturn(null);

        service().assertAllowed("cliente@exemplo.mz");

        assertThat(readKeys()).allSatisfy(key -> assertThat(key).doesNotContain("cliente", "exemplo.mz"));
    }

    @Test
    void travãoGlobalTravaMesmoComEnderecosNovos() {
        when(values.get(anyString()))
                .thenReturn("0")
                .thenReturn(String.valueOf(MAX_GLOBAL_PER_HOUR));

        assertThatThrownBy(() -> service().assertAllowed("novo@exemplo.mz"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("volume invulgar de emails");
    }

    @Test
    void semEnderecoSoAplicaOTravaoGlobal() {
        when(values.get(anyString())).thenReturn(null);

        service().assertAllowed(null);

        assertThat(readKeys()).allSatisfy(key -> assertThat(key).startsWith("nsm:mail:global:"));
    }

    @Test
    void registarEnvioIncrementaOsDoisContadores() {
        service().recordSent("cliente@exemplo.mz");

        ArgumentCaptor<List<String>> keys = ArgumentCaptor.forClass(List.class);
        verify(redis, org.mockito.Mockito.times(2)).execute(any(), keys.capture(), anyString());
        assertThat(keys.getAllValues()).anySatisfy(k -> assertThat(k.get(0)).startsWith("nsm:mail:addr:"));
        assertThat(keys.getAllValues()).anySatisfy(k -> assertThat(k.get(0)).startsWith("nsm:mail:global:"));
    }

    @Test
    void asTentativasRecusadasNaoGastamQuota() {
        when(values.get(anyString())).thenReturn(null);

        service().assertAllowed("cliente@exemplo.mz");
        service().assertAllowed("cliente@exemplo.mz");

        // A verificação é só uma leitura: nada foi incrementado.
        verify(values, never()).increment(anyString());
        verify(redis, never()).execute(any(), any(), anyString());
    }

    @Test
    void desativadoNaoTocaNoRedis() {
        service(false).assertAllowed("cliente@exemplo.mz");
        service(false).recordSent("cliente@exemplo.mz");

        verifyNoInteractions(redis);
    }

    @Test
    void falhaAbertaQuandoORedisEstaIndisponivel() {
        when(values.get(anyString()))
                .thenThrow(new RedisConnectionFailureException("ligação recusada"));

        assertThatCode(() -> service().assertAllowed("cliente@exemplo.mz"))
                .doesNotThrowAnyException();
    }
}
