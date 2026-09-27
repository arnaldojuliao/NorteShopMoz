package mz.norteshopmoz.api.web.dto;

import java.util.List;
import java.util.Map;
import mz.norteshopmoz.api.domain.Order;

/**
 * Página de pedidos do painel admin (resposta de
 * {@code GET /api/orders/admin/all}).
 *
 * <p>Antes este endpoint devolvia a lista <strong>completa</strong>: cada pedido
 * traz os itens (EAGER), pelo que o painel — e o servidor — carregavam todo o
 * histórico a cada abertura e a cada clique em "Atualizar". Com muitos milhares
 * de pedidos isso é memória e latência a crescer sem limite.</p>
 *
 * <p>{@code statusCounts} traz a contagem total por estado (uma query
 * {@code group by}) para os filtros do painel continuarem a mostrar números
 * verdadeiros, e não apenas os da página atual.</p>
 *
 * @param items       pedidos da página, do mais recente para o mais antigo
 * @param page        índice da página (base 0)
 * @param size        tamanho da página efetivamente aplicado
 * @param totalItems  total de pedidos que correspondem ao filtro
 * @param totalPages  número de páginas
 * @param hasNext     existe uma página seguinte?
 * @param statusCounts total de pedidos por estado (rótulo do contrato)
 */
public record OrderPage(
        List<Order> items,
        int page,
        int size,
        long totalItems,
        int totalPages,
        boolean hasNext,
        Map<String, Long> statusCounts) {
}
