package mz.norteshopmoz.api.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.OrderStatus;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.OrderRepository;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.web.dto.OrderPage;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Leitura de pedidos: histórico do cliente, paginação do painel, consulta
 * individual, estatísticas de vendas e linhas do export CSV.
 *
 * <p>Extraído do {@code OrderService}, que acumulava escrita (checkout,
 * cancelamento, transições de estado, reposição de stock, emails) e leitura —
 * 956 linhas em que metade não toca no stock nem cobra nada. Separados, o
 * contrato fica mais claro: quem escreve injecta o {@link OrderService}, quem só
 * mostra injecta este.</p>
 *
 * <p>Tudo aqui é {@code readOnly}: nada deste serviço altera um pedido.</p>
 */
@Service
public class OrderQueryService {

    /**
     * Teto do histórico por utilizador — {@code Order.items} é EAGER, pelo que o
     * histórico inteiro (com itens) podia crescer sem limite com a antiguidade da
     * conta. 200 pedidos cobre qualquer cliente real; para mais, paginar (como o
     * painel admin).
     */
    private static final int MAX_MY_ORDERS = 200;

    /** Tamanho de página por omissão do painel. */
    private static final int DEFAULT_PAGE_SIZE = 20;

    /** Teto do tamanho de página — `?size=100000` não pode voltar a carregar tudo. */
    private static final int MAX_PAGE_SIZE = 100;

    /**
     * Estados que contam como receita (pagamento já confirmado). Cancelado e
     * "Pedido recebido" ficam de fora — o pagamento ainda pode não acontecer.
     */
    private static final List<OrderStatus> REVENUE_STATUSES = List.of(
            OrderStatus.PAGAMENTO_CONFIRMADO,
            OrderStatus.EM_PREPARACAO,
            OrderStatus.ENVIADO,
            OrderStatus.EM_TRANSITO,
            OrderStatus.ENTREGUE);

    /** Teto de linhas do export — protege a memória de um período sem limites. */
    public static final int MAX_EXPORT_ROWS = 10_000;

    private final OrderRepository orderRepository;

    public OrderQueryService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    @Transactional(readOnly = true)
    public List<Order> getMyOrders(String userId) {
        return orderRepository.findRecentByUserId(userId, PageRequest.of(0, MAX_MY_ORDERS));
    }

    /**
     * Página de pedidos (admin), opcionalmente filtrada por estado.
     * Estado inválido → 400 (para o admin apanhar erros de filtro cedo).
     *
     * <p>Tudo é resolvido no <strong>SQL</strong>: o filtro de estado, a
     * ordenação, o limite/deslocamento e a contagem. Antes carregava-se o
     * histórico completo (com os itens, EAGER) e filtrava-se em memória — o
     * painel e o servidor cresciam sem limite com o número de pedidos. A
     * contagem por estado vai numa única query {@code group by} para os filtros
     * do painel mostrarem totais verdadeiros (e não os da página atual).</p>
     */
    @Transactional(readOnly = true)
    public OrderPage listAllOrders(String statusLabel, int page, int size) {
        OrderStatus status = null;
        if (statusLabel != null && !statusLabel.isBlank()) {
            status = OrderStatus.fromLabel(statusLabel)
                    .orElseThrow(() -> ApiException.badRequest("Estado inválido: " + statusLabel));
        }

        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        // Desempate pelo id: sem ele, dois pedidos com a mesma data podiam trocar
        // de posição entre páginas e aparecer repetidos (ou nenhum) ao paginar.
        Pageable pageable = PageRequest.of(
                Math.max(page, 0),
                safeSize,
                Sort.by(Sort.Order.desc("date"), Sort.Order.desc("id")));

        Page<Order> result = status == null
                ? orderRepository.findAll(pageable)
                : orderRepository.findByStatus(status, pageable);

        Map<String, Long> statusCounts = new LinkedHashMap<>();
        for (OrderStatus s : OrderStatus.values()) {
            statusCounts.put(s.getLabel(), 0L);
        }
        for (Object[] row : orderRepository.countGroupedByStatus()) {
            statusCounts.put(((OrderStatus) row[0]).getLabel(), ((Number) row[1]).longValue());
        }

        // Badge do painel: pedidos a aguardar pagamento que ficaram sem link do
        // gateway (o admin tem de colar um). Contagem no SQL — não depende da
        // página/filtro que está aberta no painel.
        long missingPaymentLink = orderRepository.countMissingPaymentLink(OrderStatus.AGUARDA_PAGAMENTO);

        return new OrderPage(result.getContent(), result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages(), result.hasNext(), statusCounts,
                missingPaymentLink);
    }

    @Transactional(readOnly = true)
    public Order getOrder(String id, UserPrincipal principal) {
        return getOrder(id, principal, null);
    }

    /**
     * Lê um pedido por ID.
     *
     * <ul>
     *   <li>Pedido ligado a uma conta: só o dono (ou um admin, para apoio ao
     *       cliente) o pode ver.</li>
     *   <li>Pedido de convidado (sem conta): exige, além do ID, uma prova de
     *       contacto — o {@code email} ou o telefone usados no checkout. Sem
     *       isto, quem tivesse o ID (ex.: um link reencaminhado) via nome,
     *       morada e telefone. Devolve 404 (não 401) quando não coincide, para
     *       não confirmar a existência do pedido.</li>
     * </ul>
     */
    @Transactional(readOnly = true)
    public Order getOrder(String id, UserPrincipal principal, String contact) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Pedido não encontrado"));
        String userId = principal == null ? null : principal.id();
        boolean admin = principal != null && "ADMIN".equalsIgnoreCase(principal.role());
        if (admin) {
            return order;
        }
        if (order.getUserId() != null) {
            if (!order.getUserId().equals(userId)) {
                throw ApiException.unauthorized("Não tem acesso a este pedido");
            }
            return order;
        }
        if (contactMatches(order, contact)) {
            return order;
        }
        throw ApiException.notFound("Pedido não encontrado");
    }

    /** Confirma se o contacto (email ou telefone) corresponde ao do pedido. */
    private static boolean contactMatches(Order order, String contact) {
        if (contact == null || contact.isBlank() || order.getAddress() == null) {
            return false;
        }
        String candidate = contact.trim();
        String orderEmail = order.getAddress().getEmail();
        if (orderEmail != null && orderEmail.equalsIgnoreCase(candidate)) {
            return true;
        }
        String orderPhone = order.getAddress().getPhone();
        return orderPhone != null && digits(orderPhone).equals(digits(candidate))
                && !digits(candidate).isEmpty();
    }

    /** Só os dígitos (para comparar telefones com/sem +258, espaços, hífenes). */
    private static String digits(String value) {
        return value == null ? "" : value.replaceAll("[^0-9]", "");
    }

    /**
     * Estatísticas gerais de vendas (admin) para o painel analytics.
     *
     * <p>Toda a agregação acontece <strong>no SQL</strong>: contagens por estado,
     * somas e a série diária vêm de queries que devolvem meia dúzia de linhas.
     * Antes carregava-se o histórico completo com os itens (EAGER) e somava-se em
     * memória — memória e latência a crescer sem limite com o número de pedidos.</p>
     */
    @Transactional(readOnly = true)
    public Map<String, Object> salesStats() {
        long totalOrders = orderRepository.count();
        return salesStatsResult(totalOrders,
                orderRepository.countByStatus(OrderStatus.ENTREGUE),
                orderRepository.countByStatus(OrderStatus.CANCELADO),
                orderRepository.countByStatusIn(REVENUE_STATUSES),
                orderRepository.sumTotalByStatusIn(REVENUE_STATUSES),
                orderRepository.sumShippingByStatusIn(REVENUE_STATUSES),
                orderRepository.sumDiscountByStatusIn(REVENUE_STATUSES),
                orderRepository.sumTotalByStatus(OrderStatus.CANCELADO),
                orderRepository.topProductsByRevenue(REVENUE_STATUSES),
                orderRepository.dailySeries(REVENUE_STATUSES));
    }

    /**
     * Estatísticas recortadas por período (filtros from/to do painel). Janela
     * {@code [from, to)} — o limite superior é exclusivo, por isso "até 31/10"
     * inclui os pedidos do próprio dia 31. Datas inválidas (from ≥ to) → 400.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> salesStats(Instant from, Instant to) {
        if (from == null || to == null) {
            throw ApiException.badRequest("Indique as datas 'from' e 'to' do período");
        }
        if (!from.isBefore(to)) {
            throw ApiException.badRequest("Período inválido: 'from' tem de ser anterior a 'to'");
        }
        return salesStatsResult(
                orderRepository.countByDateGreaterThanEqualAndDateLessThan(from, to),
                orderRepository.countByStatusAndDateGreaterThanEqualAndDateLessThan(
                        OrderStatus.ENTREGUE, from, to),
                orderRepository.countByStatusAndDateGreaterThanEqualAndDateLessThan(
                        OrderStatus.CANCELADO, from, to),
                orderRepository.countByStatusInAndDateGreaterThanEqualAndDateLessThan(
                        REVENUE_STATUSES, from, to),
                orderRepository.sumTotalByStatusInBetween(REVENUE_STATUSES, from, to),
                orderRepository.sumShippingByStatusInBetween(REVENUE_STATUSES, from, to),
                orderRepository.sumDiscountByStatusInBetween(REVENUE_STATUSES, from, to),
                orderRepository.sumTotalByStatusBetween(OrderStatus.CANCELADO, from, to),
                orderRepository.topProductsByRevenueBetween(REVENUE_STATUSES, from, to),
                orderRepository.dailySeriesBetween(REVENUE_STATUSES, from, to));
    }

    /**
     * Monta o mapa de estatísticas a partir das linhas SQL — a visão total e a
     * por período partilham exatamente a mesma formatação (o painel não vê
     * diferença para além dos números).
     */
    private Map<String, Object> salesStatsResult(long totalOrders, long deliveredOrders,
            long cancelledOrders, long paidOrders, java.math.BigDecimal revenue,
            java.math.BigDecimal shippingCollected, java.math.BigDecimal discountsGiven,
            java.math.BigDecimal cancelledValue,
            List<Object[]> topProductsRows, List<Object[]> daysRows) {
        long inProgressOrders = totalOrders - deliveredOrders - cancelledOrders;

        List<Map<String, Object>> topProducts = new ArrayList<>();
        for (Object[] row : topProductsRows) {
            if (topProducts.size() >= 5) {
                break;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("productId", row[0]);
            item.put("name", row[1]);
            item.put("revenue", row[2]);
            topProducts.add(item);
        }

        List<Map<String, Object>> daysSeries = new ArrayList<>();
        for (Object[] row : daysRows) {
            if (daysSeries.size() >= 30) {
                break;
            }
            Map<String, Object> day = new LinkedHashMap<>();
            day.put("date", String.format("%04d-%02d-%02d",
                    ((Number) row[0]).intValue(), ((Number) row[1]).intValue(), ((Number) row[2]).intValue()));
            day.put("orders", ((Number) row[3]).longValue());
            day.put("revenue", row[4]);
            daysSeries.add(day);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalOrders", totalOrders);
        result.put("deliveredOrders", deliveredOrders);
        result.put("cancelledOrders", cancelledOrders);
        result.put("inProgressOrders", inProgressOrders);
        result.put("revenue", revenue);
        result.put("shippingCollected", shippingCollected);
        result.put("discountsGiven", discountsGiven);
        result.put("cancelledValue", cancelledValue);
        // Ticket médio = receita confirmada / pedidos que a geraram (e não o
        // total de pedidos: incluir cancelados e pedidos por pagar misturava
        // grandezas e fazia o indicador desabar sem a receita mudar).
        result.put("avgOrderValue", paidOrders > 0
                ? revenue.divide(java.math.BigDecimal.valueOf(paidOrders), 2,
                        java.math.RoundingMode.HALF_UP)
                : java.math.BigDecimal.ZERO);
        result.put("topProducts", topProducts);
        result.put("days", daysSeries);
        return result;
    }

    /**
     * Linhas do relatório CSV (admin), no período e estado pedidos. Projeção
     * enxuta do SQL — sem carregar itens.
     */
    @Transactional(readOnly = true)
    public List<Object[]> exportRows(Instant from, Instant to, OrderStatus status) {
        if (from == null || to == null) {
            throw ApiException.badRequest("Indique as datas 'from' e 'to' do período");
        }
        if (!from.isBefore(to)) {
            throw ApiException.badRequest("Período inválido: 'from' tem de ser anterior a 'to'");
        }
        List<Object[]> rows = status == null
                ? orderRepository.exportRowsBetween(from, to)
                : orderRepository.exportRowsBetweenByStatus(from, to, status);
        if (rows.size() > MAX_EXPORT_ROWS) {
            throw ApiException.badRequest("Período demasiado largo (" + rows.size()
                    + " pedidos; máximo " + MAX_EXPORT_ROWS + "). Reduza o intervalo ou filtre por estado.");
        }
        return rows;
    }
}
