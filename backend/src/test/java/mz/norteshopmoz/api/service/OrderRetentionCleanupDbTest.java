package mz.norteshopmoz.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.OrderAddress;
import mz.norteshopmoz.api.domain.OrderItem;
import mz.norteshopmoz.api.domain.OrderStatus;
import mz.norteshopmoz.api.repository.OrderRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

/**
 * Retenção de pedidos (ver OrderRetentionCleanup).
 *
 * <p>Corre com {@code app.orders.retention-days=1} para exercitar o SQL real
 * (H2 no perfil {@code unit-test}) — a consulta dos itens é <strong>nativa</strong>
 * (o {@code OrderItem} não navega para o pedido), pelo que só um teste com base de
 * dados a valida.</p>
 */
@SpringBootTest
@ActiveProfiles("unit-test")
@TestPropertySource(properties = "app.orders.retention-days=1")
class OrderRetentionCleanupDbTest {

    @Autowired
    private OrderRetentionCleanup retention;

    @Autowired
    private OrderRepository orderRepository;

    /** Pedido com um item, num estado e data dados. */
    private Order persist(String id, OrderStatus status, Instant date) {
        OrderItem item = OrderItem.builder()
                .productId("p-" + id)
                .slug("slug-" + id)
                .name("Produto " + id)
                .image("img.jpg")
                .price(new BigDecimal("1000"))
                .qty(2)
                .build();
        Order order = Order.builder()
                .id("NSM-" + id)
                .date(date)
                .userId(null)
                .items(List.of(item))
                .subtotal(new BigDecimal("2000"))
                .shipping(new BigDecimal("100"))
                .discount(BigDecimal.ZERO)
                .total(new BigDecimal("2100"))
                .status(status)
                .address(OrderAddress.builder()
                        .fullName("Cliente")
                        .phone("+258840000000")
                        .email("retencao@exemplo.mz")
                        .address("Rua 1")
                        .city("Maputo")
                        .province("Maputo Cidade")
                        .build())
                .paymentMethod("Pagamento na entrega")
                .build();
        return orderRepository.save(order);
    }

    @Test
    void apagaApenasOsPedidosTerminaisAntigos() {
        Instant antigo = Instant.now().minus(Duration.ofDays(30));
        Order entregueAntigo = persist("entrega-antiga", OrderStatus.ENTREGUE, antigo);
        Order canceladoAntigo = persist("cancelado-antigo", OrderStatus.CANCELADO, antigo);
        // Em curso: tem valor operacional, nunca pode ser apagado.
        Order emCurso = persist("em-curso", OrderStatus.ENVIADO, antigo);
        // Terminal mas recente: ainda dentro da retenção.
        Order entregueRecente = persist("entrega-recente", OrderStatus.ENTREGUE, Instant.now());

        int removidos = retention.purge();

        assertThat(removidos).isEqualTo(2);
        assertThat(orderRepository.findById(entregueAntigo.getId())).isEmpty();
        assertThat(orderRepository.findById(canceladoAntigo.getId())).isEmpty();
        assertThat(orderRepository.findById(emCurso.getId())).isPresent();
        assertThat(orderRepository.findById(entregueRecente.getId())).isPresent();
    }

    @Test
    void retencaoZeroDesligaOExpurgo() {
        // 0 é o opt-out: mantém todo o histórico (obrigações fiscais/contabilidade).
        // O valor por omissão é 730 dias (ver application.yaml), mas isso não
        // impede desligar explicitamente.
        OrderRepository mockRepository = mock(OrderRepository.class);
        OrderRetentionCleanup desligado = new OrderRetentionCleanup(mockRepository, 0);

        assertThat(desligado.isEnabled()).isFalse();
        assertThat(desligado.purge()).isZero();
        verifyNoInteractions(mockRepository);
    }
}
