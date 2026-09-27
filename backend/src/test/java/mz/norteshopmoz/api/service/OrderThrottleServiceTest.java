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
 * Travão do checkout público (ver OrderThrottleService).
 *
 * <p>O que estes testes protegem:</p>
 * <ul>
 *   <li>o teto por <strong>contacto</strong> (email/telefone) trava o abuso
 *       repetido do mesmo endereço — e o mesmo email com maiúsculas diferentes
 *       conta como o mesmo contacto;</li>
 *   <li>só conta quem <strong>criou</strong> pedidos: as tentativas falhadas não
 *       gastam quota (a verificação é uma leitura);</li>
 *   <li>com o Redis indisponível o pedido <strong>passa</strong> — a loja não pode
 *       fechar por causa de um travão acessório.</li>
 * </ul>
 */
class OrderThrottleServiceTest {

    private static final int MAX_PER_CONTACT = 3;
    private static final int MAX_GLOBAL_PER_HOUR = 200;

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

    private OrderThrottleService service() {
        return service(true);
    }

    private OrderThrottleService service(boolean enabled) {
        // O encanamento (contadores atómicos no Redis + circuito) é partilhado com
        // o travão de emails — ver RedisCounterThrottle.
        RedisCounterThrottle counters = new RedisCounterThrottle(redis, circuitBreaker);
        return new OrderThrottleService(counters, enabled, MAX_PER_CONTACT, 60, MAX_GLOBAL_PER_HOUR);
    }

    /** Chaves lidas na verificação (contacto e global). */
    private List<String> readKeys() {
        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(values, org.mockito.Mockito.atLeastOnce()).get(captor.capture());
        return captor.getAllValues();
    }

    @Test
    void primeiroPedidoPassa() {
        when(values.get(anyString())).thenReturn(null);

        assertThatCode(() -> service().assertAllowed("cliente@exemplo.mz", null))
                .doesNotThrowAnyException();
    }

    @Test
    void recusaAoAtingirOTetoPorContacto() {
        when(values.get(anyString())).thenReturn(String.valueOf(MAX_PER_CONTACT));

        assertThatThrownBy(() -> service().assertAllowed("cliente@exemplo.mz", null))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Limite de pedidos");
    }

    @Test
    void oMesmoEmailComMaiusculasContaComoOMesmoContacto() {
        when(values.get(anyString())).thenReturn(null);

        service().assertAllowed("Cliente@Exemplo.MZ", null);
        String primeira = readKeys().stream().filter(k -> k.startsWith("nsm:orders:contact:")).findFirst()
                .orElseThrow();

        org.mockito.Mockito.reset(values);
        when(values.get(anyString())).thenReturn(null);
        service().assertAllowed("cliente@exemplo.mz", null);
        String segunda = readKeys().stream().filter(k -> k.startsWith("nsm:orders:contact:")).findFirst()
                .orElseThrow();

        assertThat(segunda).isEqualTo(primeira);
    }

    @Test
    void semEmailUsaOTelefoneComoContacto() {
        when(values.get(anyString())).thenReturn(null);

        service().assertAllowed(null, "+258 84 123 4567");

        assertThat(readKeys()).anySatisfy(key -> assertThat(key).startsWith("nsm:orders:contact:"));
    }

    @Test
    void semContactoNenhumSoAplicaOTravaoGlobal() {
        when(values.get(anyString())).thenReturn(null);

        service().assertAllowed(null, null);

        // Apenas a janela global foi lida: não há contacto por onde travar, e é
        // melhor deixar passar do que inventar uma chave partilhada por todos.
        assertThat(readKeys()).allSatisfy(key -> assertThat(key).startsWith("nsm:orders:global:"));
    }

    @Test
    void travãoGlobalTravaMesmoComContactosNovos() {
        // A janela global é a primeira chave lida? Não: o contacto é lido primeiro
        // e devolve 0, e o global devolve o teto.
        when(values.get(anyString()))
                .thenReturn("0")
                .thenReturn(String.valueOf(MAX_GLOBAL_PER_HOUR));

        assertThatThrownBy(() -> service().assertAllowed("novo@exemplo.mz", null))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("volume invulgar");
    }

    @Test
    void registarPedidoIncrementaOsDoisContadores() {
        service().recordCreated("cliente@exemplo.mz", "+258840000000");

        ArgumentCaptor<List<String>> keys = ArgumentCaptor.forClass(List.class);
        verify(redis, org.mockito.Mockito.times(2)).execute(any(), keys.capture(), anyString());
        assertThat(keys.getAllValues()).anySatisfy(k -> assertThat(k.get(0)).startsWith("nsm:orders:contact:"));
        assertThat(keys.getAllValues()).anySatisfy(k -> assertThat(k.get(0)).startsWith("nsm:orders:global:"));
        // O TTL vai no mesmo script (INCR + PEXPIRE atómicos): sem isto, uma chave
        // podia ficar sem TTL na instância noeviction e só crescer na memória.
        verify(redis, org.mockito.Mockito.times(2)).execute(any(), any(), anyString());
    }

    @Test
    void asTentativasFalhadasNaoGastamQuota() {
        when(values.get(anyString())).thenReturn(null);

        // Três tentativas que nunca criam pedido (ex.: produto esgotado): nenhuma
        // incrementa contadores.
        service().assertAllowed("cliente@exemplo.mz", null);
        service().assertAllowed("cliente@exemplo.mz", null);
        service().assertAllowed("cliente@exemplo.mz", null);

        verify(values, never()).increment(anyString());
        verify(redis, never()).execute(any(), any(), anyString());
    }

    @Test
    void desativadoNaoTocaNoRedis() {
        service(false).assertAllowed("cliente@exemplo.mz", null);
        service(false).recordCreated("cliente@exemplo.mz", null);

        verifyNoInteractions(redis);
    }

    @Test
    void falhaAbertaQuandoORedisEstaIndisponivel() {
        when(values.get(anyString()))
                .thenThrow(new RedisConnectionFailureException("ligação recusada"));

        // O pedido é deixado passar: o travão é acessório, a loja não pode fechar.
        assertThatCode(() -> service().assertAllowed("cliente@exemplo.mz", null))
                .doesNotThrowAnyException();
    }

    @Test
    void falhaAbertaAoRegistarNaoPropaga() {
        org.mockito.Mockito.doThrow(new RedisConnectionFailureException("ligação recusada"))
                .when(redis).execute(any(), any(), anyString());

        assertThatCode(() -> service().recordCreated("cliente@exemplo.mz", null))
                .doesNotThrowAnyException();
    }
}
