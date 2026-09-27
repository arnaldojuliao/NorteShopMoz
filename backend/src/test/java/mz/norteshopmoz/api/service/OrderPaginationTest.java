package mz.norteshopmoz.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.OrderAddress;
import mz.norteshopmoz.api.domain.OrderItem;
import mz.norteshopmoz.api.domain.OrderStatus;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.OrderRepository;
import mz.norteshopmoz.api.web.dto.OrderPage;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;

/**
 * Paginação da listagem de pedidos do painel admin.
 *
 * <p>Antes {@code GET /api/orders/admin/all} devolvia o histórico completo (com
 * os itens de cada pedido, EAGER) e o filtro por estado era aplicado em memória.
 * Estes testes fixam o contrato novo: filtro, ordenação e limite resolvidos no
 * SQL, contadores por estado com os totais reais e um teto de página que impede
 * {@code ?size=100000} de voltar a carregar tudo.</p>
 *
 * <p>As contagens são comparadas com a base (e não com números absolutos) para
 * serem imunes a pedidos criados por outros testes.</p>
 */
@SpringBootTest
@ActiveProfiles("unit-test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class OrderPaginationTest {

    @Autowired
    OrderService orderService;

    @Autowired
    OrderRepository orderRepository;

    private Order order(OrderStatus status, String id) {
        return Order.builder()
                .id(id)
                .date(Instant.now())
                .items(new ArrayList<>(List.of(OrderItem.builder()
                        .productId("p-" + id)
                        .slug("slug-" + id)
                        .name("Produto " + id)
                        .image("img.jpg")
                        .price(new BigDecimal("1000"))
                        .qty(1)
                        .build())))
                .subtotal(new BigDecimal("1000"))
                .shipping(new BigDecimal("100"))
                .discount(BigDecimal.ZERO)
                .total(new BigDecimal("1100"))
                .status(status)
                .address(OrderAddress.builder()
                        .fullName("Cliente")
                        .phone("841234567")
                        .email("cliente@example.com")
                        .address("Rua 1")
                        .city("Maputo")
                        .province("Maputo")
                        .build())
                .paymentMethod("Pagamento na entrega")
                .build();
    }

    @Test
    void paginaEFiltraNoServidor() {
        String suffix = Long.toString(System.nanoTime());
        // 5 pedidos novos: garante pelo menos duas páginas completas de 2.
        for (int i = 0; i < 5; i++) {
            OrderStatus status = i == 0 ? OrderStatus.ENTREGUE : OrderStatus.PEDIDO_RECEBIDO;
            orderRepository.save(order(status, "NSM-P" + i + suffix.substring(0, 4)));
        }
        long total = orderRepository.count();

        OrderPage first = orderService.listAllOrders(null, 0, 2);
        assertThat(first.items()).hasSize(2);
        assertThat(first.page()).isZero();
        assertThat(first.size()).isEqualTo(2);
        assertThat(first.totalItems()).isEqualTo(total);
        assertThat(first.totalPages()).isEqualTo((int) ((total + 1) / 2));
        assertThat(first.hasNext()).isTrue();

        // Página seguinte sem repetir pedidos (o desempate por id evita que dois
        // pedidos com a mesma data troquem de posição entre páginas).
        OrderPage second = orderService.listAllOrders(null, 1, 2);
        assertThat(second.page()).isEqualTo(1);
        assertThat(second.items()).hasSize(2);
        assertThat(second.items()).extracting(Order::getId)
                .doesNotContainAnyElementsOf(first.items().stream().map(Order::getId).toList());

        // Última página sem `hasNext`.
        OrderPage last = orderService.listAllOrders(null, first.totalPages() - 1, 2);
        assertThat(last.hasNext()).isFalse();

        // Filtro por estado resolvido no SQL: só devolve o estado pedido e o
        // total corresponde a esse estado (não ao histórico todo).
        OrderPage delivered = orderService.listAllOrders("Entregue", 0, 100);
        assertThat(delivered.totalItems()).isEqualTo(orderRepository.countByStatus(OrderStatus.ENTREGUE));
        assertThat(delivered.totalItems()).isLessThanOrEqualTo(total);
        assertThat(delivered.items()).isNotEmpty()
                .allSatisfy(o -> assertThat(o.getStatus()).isEqualTo(OrderStatus.ENTREGUE));

        // Estado inválido → 400 (falha cedo em vez de devolver lista vazia).
        assertThatThrownBy(() -> orderService.listAllOrders("NaoExiste", 0, 2))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Estado inválido");

        // Teto de página: `?size=100000` não pode voltar a carregar tudo.
        OrderPage huge = orderService.listAllOrders(null, 0, 100_000);
        assertThat(huge.size()).isEqualTo(100);
        assertThat(huge.items()).hasSize((int) Math.min(100, total));

        // Contadores dos filtros: somam TODOS os pedidos, não os da página.
        long summed = huge.statusCounts().values().stream().mapToLong(Long::longValue).sum();
        assertThat(summed).isEqualTo(total);
        assertThat(huge.statusCounts()).containsEntry("Entregue",
                orderRepository.countByStatus(OrderStatus.ENTREGUE));
    }
}
