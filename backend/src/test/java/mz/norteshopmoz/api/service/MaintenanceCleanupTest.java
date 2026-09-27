package mz.norteshopmoz.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Collection;
import java.util.List;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.repository.OrderRepository;
import mz.norteshopmoz.api.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

/**
 * Manutenção periódica: conjuntos de refresh tokens vazios / de contas que já
 * não existem, e chaves de idempotência de pedidos que já não existem.
 */
class MaintenanceCleanupTest {

    private static final String REFRESH_A = "nsm:auth:refresh:user-a";
    private static final String REFRESH_B = "nsm:auth:refresh:user-b";
    private static final String REFRESH_GONE = "nsm:auth:refresh:user-apagado";

    private StringRedisTemplate redis;
    private SetOperations<String, String> setOps;
    private ValueOperations<String, String> valueOps;
    private UserRepository userRepository;
    private OrderRepository orderRepository;
    private OrphanDataCleanup orphanDataCleanup;
    private OrderRetentionCleanup orderRetentionCleanup;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        redis = mock(StringRedisTemplate.class);
        setOps = mock(SetOperations.class);
        valueOps = mock(ValueOperations.class);
        userRepository = mock(UserRepository.class);
        orderRepository = mock(OrderRepository.class);
        orphanDataCleanup = mock(OrphanDataCleanup.class);
        orderRetentionCleanup = mock(OrderRetentionCleanup.class);
        when(redis.opsForSet()).thenReturn(setOps);
        when(redis.opsForValue()).thenReturn(valueOps);
    }

    private MaintenanceCleanup cleanup(boolean enabled) {
        return new MaintenanceCleanup(redis, userRepository, orderRepository, orphanDataCleanup,
                orderRetentionCleanup, enabled, 100);
    }

    /** Cursor de SCAN que devolve os valores dados e depois termina. */
    @SuppressWarnings("unchecked")
    private static Cursor<String> cursor(String... values) {
        Cursor<String> cursor = mock(Cursor.class);
        final int[] index = {0};
        when(cursor.hasNext()).thenAnswer(inv -> index[0] < values.length);
        when(cursor.next()).thenAnswer(inv -> values[index[0]++]);
        return cursor;
    }

    @Test
    void removeConjuntosVaziosEDeContasQueJaNaoExistem() {
        Cursor<String> keys = cursor(REFRESH_A, REFRESH_B, REFRESH_GONE);
        when(redis.scan(any(ScanOptions.class))).thenReturn(keys);
        when(setOps.size(REFRESH_A)).thenReturn(2L);        // sessão ativa
        when(setOps.size(REFRESH_B)).thenReturn(0L);        // ficou vazia após logouts
        when(setOps.size(REFRESH_GONE)).thenReturn(4L);     // mas a conta já não existe
        when(userRepository.existsById("user-a")).thenReturn(true);
        when(userRepository.existsById("user-apagado")).thenReturn(false);

        long removed = cleanup(true).purgeOrphanSessionKeys();

        assertThat(removed).isEqualTo(2);
        verify(redis).delete(REFRESH_B);
        verify(redis).delete(REFRESH_GONE);
        verify(redis, never()).delete(REFRESH_A);
        // Uma sessão viva nunca é tocada.
        verify(userRepository).existsById("user-a");
    }

    @Test
    void removeIdempotenciaSemValorEObsoleta() {
        String k1 = "nsm:order:idem:k1";
        String k2 = "nsm:order:idem:k2";
        String k3 = "nsm:order:idem:k3";
        Cursor<String> keys = cursor(k1, k2, k3);
        when(redis.scan(any(ScanOptions.class))).thenReturn(keys);
        when(valueOps.get(k1)).thenReturn("NSM-EXISTE");
        when(valueOps.get(k2)).thenReturn("NSM-APAGADO");
        when(valueOps.get(k3)).thenReturn(null);
        when(orderRepository.findAllById(any())).thenReturn(List.of(Order.builder().id("NSM-EXISTE").build()));

        long removed = cleanup(true).purgeStaleIdempotencyKeys();

        assertThat(removed).isEqualTo(2);
        // k3 não tem valor (sem idempotência a preservar).
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Collection<String>> captor = ArgumentCaptor.forClass(Collection.class);
        verify(redis, org.mockito.Mockito.times(2)).delete(captor.capture());
        assertThat(captor.getAllValues()).anySatisfy(batch -> assertThat(batch).containsExactly(k3));
        assertThat(captor.getAllValues()).anySatisfy(batch -> assertThat(batch).containsExactly(k2));
    }

    @Test
    void mantemIdempotenciaDePedidosQueExistem() {
        String k1 = "nsm:order:idem:k1";
        Cursor<String> keys = cursor(k1);
        when(redis.scan(any(ScanOptions.class))).thenReturn(keys);
        when(valueOps.get(k1)).thenReturn("NSM-EXISTE");
        when(orderRepository.findAllById(any())).thenReturn(List.of(Order.builder().id("NSM-EXISTE").build()));

        long removed = cleanup(true).purgeStaleIdempotencyKeys();

        assertThat(removed).isZero();
        verify(redis, never()).delete(anyString());
        verify(redis, never()).delete(any(Collection.class));
    }

    @Test
    void naoExecutaNadaQuandoDesativado() {
        cleanup(false).run();

        verifyNoInteractions(orphanDataCleanup, orderRetentionCleanup, redis, userRepository, orderRepository);
    }

    @Test
    void falhaNumaParteNaoImpedeAsOutrasNemPropaga() {
        doThrow(new RuntimeException("base de dados indisponível")).when(orphanDataCleanup).purge();
        Cursor<String> vazio = cursor();
        when(redis.scan(any(ScanOptions.class))).thenReturn(vazio);

        // Não deve lançar.
        cleanup(true).run();

        // O expurgo na BD falhou, mas as restantes etapas continuaram — incluindo
        // a retenção de pedidos e as duas varreduras do Redis (sessões e idempotência).
        verify(orphanDataCleanup).purge();
        verify(orderRetentionCleanup).purge();
        verify(redis, org.mockito.Mockito.times(2)).scan(any(ScanOptions.class));
    }
}
