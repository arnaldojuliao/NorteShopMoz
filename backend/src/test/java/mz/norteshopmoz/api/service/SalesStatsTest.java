package mz.norteshopmoz.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.OrderAddress;
import mz.norteshopmoz.api.domain.OrderItem;
import mz.norteshopmoz.api.domain.OrderStatus;
import mz.norteshopmoz.api.repository.OrderRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;

/**
 * Estatísticas de vendas agregadas no SQL.
 *
 * <p>Os totais são comparados com a base antes/depois (e não com números
 * absolutos) para serem imunes a pedidos criados por outros testes dentro do
 * mesmo contexto. O que este teste garante é que as queries de agregação somam
 * exatamente os pedidos que deviam — e que o agrupamento por dia é portável.</p>
 */
@SpringBootTest
@ActiveProfiles("unit-test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class SalesStatsTest {

    private static final List<OrderStatus> REVENUE = List.of(
            OrderStatus.PAGAMENTO_CONFIRMADO,
            OrderStatus.EM_PREPARACAO,
            OrderStatus.ENVIADO,
            OrderStatus.EM_TRANSITO,
            OrderStatus.ENTREGUE);

    @Autowired
    OrderService orderService;

    @Autowired
    OrderRepository orderRepository;

    private Order order(OrderStatus status, String id, String total, String shipping, String discount,
            String productId, String price, int qty) {
        return Order.builder()
                .id(id)
                .date(Instant.now())
                .items(new ArrayList<>(List.of(OrderItem.builder()
                        .productId(productId)
                        .slug("slug-" + productId)
                        .name("Produto " + productId)
                        .image("img.jpg")
                        .price(new BigDecimal(price))
                        .qty(qty)
                        .build())))
                .subtotal(new BigDecimal(total))
                .shipping(new BigDecimal(shipping))
                .discount(new BigDecimal(discount))
                .total(new BigDecimal(total))
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

    /**
     * [nº pedidos, receita] do dia de hoje na série, ou zeros se não existir.
     *
     * <p>O "hoje" é o dia em UTC, e não no fuso local: a ligação JDBC corre com
     * {@code hibernate.jdbc.time_zone=UTC} (ver application.yaml), pelo que
     * {@code year()/month()/day()} do SQL são em UTC. Usar {@code LocalDate.now()}
     * fazia o teste falhar nas primeiras horas do dia em fusos à frente de UTC
     * (ex.: Maputo, UTC+2) — o dia local já era o seguinte e nenhuma linha da
     * série correspondia.</p>
     */
    private static BigDecimal[] today(List<Object[]> series) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        for (Object[] row : series) {
            int year = ((Number) row[0]).intValue();
            int month = ((Number) row[1]).intValue();
            int day = ((Number) row[2]).intValue();
            if (year == today.getYear() && month == today.getMonthValue() && day == today.getDayOfMonth()) {
                return new BigDecimal[]{
                        BigDecimal.valueOf(((Number) row[3]).longValue()),
                        (BigDecimal) row[4]};
            }
        }
        return new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO};
    }

    @Test
    @SuppressWarnings("unchecked")
    void agregaTotaisContagensETopProdutos() {
        long baseTotal = orderRepository.count();
        long baseDelivered = orderRepository.countByStatus(OrderStatus.ENTREGUE);
        long baseCancelled = orderRepository.countByStatus(OrderStatus.CANCELADO);
        BigDecimal baseRevenue = orderRepository.sumTotalByStatusIn(REVENUE);
        BigDecimal baseShipping = orderRepository.sumShippingByStatusIn(REVENUE);
        BigDecimal baseDiscounts = orderRepository.sumDiscountByStatusIn(REVENUE);
        BigDecimal baseCancelledValue = orderRepository.sumTotalByStatus(OrderStatus.CANCELADO);
        BigDecimal[] baseToday = today(orderRepository.dailySeries(REVENUE));

        String suffix = Long.toString(System.nanoTime());
        orderRepository.save(order(OrderStatus.ENTREGUE, "NSM-S1" + suffix.substring(0, 4),
                "1000", "100", "50", "pX-" + suffix, "1000", 1));
        orderRepository.save(order(OrderStatus.PEDIDO_RECEBIDO, "NSM-S2" + suffix.substring(0, 4),
                "500", "50", "0", "pY-" + suffix, "500", 1));
        orderRepository.save(order(OrderStatus.CANCELADO, "NSM-S3" + suffix.substring(0, 4),
                "300", "0", "0", "pZ-" + suffix, "300", 1));

        Map<String, Object> stats = orderService.salesStats();

        assertThat((long) stats.get("totalOrders")).isEqualTo(baseTotal + 3);
        assertThat((long) stats.get("deliveredOrders")).isEqualTo(baseDelivered + 1);
        assertThat((long) stats.get("cancelledOrders")).isEqualTo(baseCancelled + 1);
        // O cancelado não entra em progresso nem na receita.
        assertThat((long) stats.get("inProgressOrders"))
                .isEqualTo((baseTotal + 3) - (baseDelivered + 1) - (baseCancelled + 1));

        assertThat((BigDecimal) stats.get("revenue")).isEqualByComparingTo(baseRevenue.add(new BigDecimal("1000")));
        assertThat((BigDecimal) stats.get("shippingCollected"))
                .isEqualByComparingTo(baseShipping.add(new BigDecimal("100")));
        assertThat((BigDecimal) stats.get("discountsGiven"))
                .isEqualByComparingTo(baseDiscounts.add(new BigDecimal("50")));
        assertThat((BigDecimal) stats.get("cancelledValue"))
                .isEqualByComparingTo(baseCancelledValue.add(new BigDecimal("300")));

        // Top produtos: o produto do pedido entregue aparece com a receita exata.
        List<Map<String, Object>> top = (List<Map<String, Object>>) stats.get("topProducts");
        assertThat(top).anySatisfy(row -> {
            assertThat(row.get("productId")).isEqualTo("pX-" + suffix);
            // O nome vem do snapshot do item, para o painel mostrar algo legível.
            assertThat(row.get("name")).isEqualTo("Produto pX-" + suffix);
            assertThat((BigDecimal) row.get("revenue")).isEqualByComparingTo(new BigDecimal("1000"));
        });
        // O produto do pedido CANCELADO não deve aparecer.
        assertThat(top).noneSatisfy(row -> assertThat(row.get("productId")).isEqualTo("pZ-" + suffix));
        // Nem o do pedido ainda por pagar: a receita por produto conta só os
        // estados com pagamento confirmado, como a receita total.
        assertThat(top).noneSatisfy(row -> assertThat(row.get("productId")).isEqualTo("pY-" + suffix));

        // Série diária: hoje ganhou 3 pedidos e 1000 de receita.
        List<Map<String, Object>> days = (List<Map<String, Object>>) stats.get("days");
        assertThat(days).isNotEmpty();
        // Mais recente primeiro.
        List<String> dates = days.stream().map(d -> (String) d.get("date")).toList();
        assertThat(dates).isSortedAccordingTo(Comparator.reverseOrder());

        BigDecimal[] afterToday = today(orderRepository.dailySeries(REVENUE));
        assertThat(afterToday[0]).isEqualByComparingTo(baseToday[0].add(new BigDecimal("3")));
        assertThat(afterToday[1]).isEqualByComparingTo(baseToday[1].add(new BigDecimal("1000")));
    }

    @Test
    void avgOrderValueIgnoraPedidosSemReceitaConfirmada() {
        // Um pedido "Pedido recebido" (offline, ainda por pagar) não é receita:
        // não pode diluir o ticket médio nem a receita confirmada.
        String suffix = Long.toString(System.nanoTime());
        orderRepository.save(order(OrderStatus.PEDIDO_RECEBIDO, "NSM-A1" + suffix.substring(0, 4),
                "5000", "0", "0", "pA-" + suffix, "5000", 1));

        Map<String, Object> stats = orderService.salesStats();

        long paid = orderRepository.countByStatusIn(REVENUE);
        BigDecimal revenue = orderRepository.sumTotalByStatusIn(REVENUE);
        BigDecimal expected = paid == 0
                ? BigDecimal.ZERO
                : revenue.divide(BigDecimal.valueOf(paid), 2, java.math.RoundingMode.HALF_UP);

        assertThat((BigDecimal) stats.get("avgOrderValue")).isEqualByComparingTo(expected);
        assertThat((BigDecimal) stats.get("revenue")).isEqualByComparingTo(revenue);
        // O ticket médio divide pela base que gerou a receita, nunca pelo total
        // de pedidos (que incluiria o pedido por pagar criado acima).
        assertThat((long) stats.get("totalOrders")).isGreaterThan(paid);
    }
}
