package mz.norteshopmoz.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import mz.norteshopmoz.api.repository.CartRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Carrinhos de convidado nunca expiravam: cada {@code X-Guest-Id} novo deixava
 * uma linha permanente. Estes testes garantem que o expurgo só apaga carrinhos
 * de convidado inativos, nunca os de contas, e que nunca rebenta o agendador.
 */
class GuestCartCleanupTest {

    private final CartRepository repository = mock(CartRepository.class);

    @Test
    void apagaCarrinhosDeConvidadoMaisAntigosQueARetencao() {
        when(repository.deleteGuestCartsOlderThan(any(), any())).thenReturn(3);
        GuestCartCleanup cleanup = new GuestCartCleanup(repository, 30, true, 50000);

        cleanup.purgeStaleGuestCarts();

        ArgumentCaptor<Instant> cutoff = ArgumentCaptor.forClass(Instant.class);
        // Só o prefixo de convidado: os carrinhos de contas ficam intactos.
        verify(repository).deleteGuestCartsOlderThan(eq("guest:%"), cutoff.capture());
        Instant expected = Instant.now().minus(Duration.ofDays(30));
        assertThat(Math.abs(Duration.between(cutoff.getValue(), expected).toMinutes()))
                .as("o corte é 'agora menos os dias de retenção'")
                .isLessThanOrEqualTo(1);
    }

    @Test
    void naoExecutaQuandoDesativado() {
        GuestCartCleanup cleanup = new GuestCartCleanup(repository, 30, false, 50000);

        cleanup.purgeStaleGuestCarts();

        verifyNoInteractions(repository);
    }

    @Test
    void retencaoInvalidaNaoApagaTudo() {
        // Retenção 0 (config errada) não pode significar "apagar todos os
        // carrinhos de convidado de uma vez" — o mínimo é 1 dia.
        GuestCartCleanup cleanup = new GuestCartCleanup(repository, 0, true, 0);

        cleanup.purgeStaleGuestCarts();

        ArgumentCaptor<Instant> cutoff = ArgumentCaptor.forClass(Instant.class);
        verify(repository).deleteGuestCartsOlderThan(any(), cutoff.capture());
        assertThat(cutoff.getValue()).isBefore(Instant.now().minus(Duration.ofHours(23)));
    }

    @Test
    void falhaNoExpurgoNaoPropagaParaOAgendador() {
        when(repository.deleteGuestCartsOlderThan(any(), any()))
                .thenThrow(new RuntimeException("base de dados indisponível"));
        GuestCartCleanup cleanup = new GuestCartCleanup(repository, 30, true, 50000);

        // Não deve lançar: uma exceção repetida a cada 6 horas só poluía os logs.
        cleanup.purgeStaleGuestCarts();

        verify(repository).deleteGuestCartsOlderThan(any(), any());
        // Mesmo com o expurgo por idade em baixo, o teto é tentado (passo isolado).
        verify(repository).deleteGuestCartsBeyondMax(eq("guest:%"), eq(50000));
    }

    @Test
    void aplicaOTetoAbsolutoDeCarrinhosDeConvidado() {
        when(repository.deleteGuestCartsBeyondMax(any(), anyInt())).thenReturn(12);
        GuestCartCleanup cleanup = new GuestCartCleanup(repository, 30, true, 50000);

        cleanup.purgeStaleGuestCarts();

        // Independente da idade: acima do teto, os mais antigos são removidos.
        verify(repository).deleteGuestCartsBeyondMax(eq("guest:%"), eq(50000));
    }

    @Test
    void tetoDesligadoNaoTocaNaBase() {
        GuestCartCleanup cleanup = new GuestCartCleanup(repository, 30, true, 0);

        cleanup.purgeStaleGuestCarts();

        verify(repository, never()).deleteGuestCartsBeyondMax(any(), anyInt());
    }
}
