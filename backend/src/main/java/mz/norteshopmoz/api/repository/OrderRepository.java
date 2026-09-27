package mz.norteshopmoz.api.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.OrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrderRepository extends JpaRepository<Order, String> {

    List<Order> findByUserIdOrderByDateDesc(String userId);

    /**
     * Histórico do utilizador com teto de linhas (mais recente primeiro).
     *
     * <p>{@code Order.items} é EAGER: devolver o histórico inteiro carregava cada
     * pedido COM os itens — memória e latência cresciam sem limite com a antiguidade
     * da conta. 200 pedidos cobre qualquer histórico de cliente; se um dia for
     * preciso mais, o certo é paginar (como o painel admin já faz) e não levantar
     * o teto.</p>
     */
    @Query("select o from Order o where o.userId = :userId order by o.date desc")
    List<Order> findRecentByUserId(@Param("userId") String userId, Pageable pageable);

    /**
     * Página de pedidos num estado, mais recente primeiro.
     *
     * <p>Filtra <strong>no SQL</strong>: antes carregavam-se todos os pedidos
     * não cancelados e filtrava-se em memória, o que anulava qualquer ganho de
     * paginar a listagem.</p>
     */
    Page<Order> findByStatus(OrderStatus status, Pageable pageable);

    /**
     * Total de pedidos por estado — uma query para os contadores dos filtros do
     * painel (não os da página atual, que seriam enganadores com paginação).
     *
     * @return linhas {@code [estado, total]}
     */
    @Query("select o.status, count(o) from Order o group by o.status")
    List<Object[]> countGroupedByStatus();

    List<Order> findTop10ByOrderByDateDesc();

    /**
     * Transição ATÓMICA para CANCELADO.
     *
     * <p>Devolve {@code 1} se ESTA chamada cancelou o pedido e {@code 0} se já
     * estava cancelado, se já foi entregue ou se não existe. É o que impede dois
     * cancelamentos concorrentes de reporem o stock duas vezes: só quem afeta a
     * linha segue para a reposição. O UPDATE condicional substitui o
     * ler-verificar-escrever (que não tinha lock nem {@code @Version} e por isso
     * permitia a corrida).</p>
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Order o set o.status = :cancelled "
            + "where o.id = :id "
            + "and o.status <> :cancelled "
            + "and o.status <> :delivered")
    int markCancelled(@Param("id") String id,
            @Param("cancelled") OrderStatus cancelled,
            @Param("delivered") OrderStatus delivered);

    /* ── Retenção (expurgo opt-in dos pedidos antigos) ────────────────────────
     *
     * Ver OrderRetentionCleanup: só corre quando `app.orders.retention-days` > 0
     * (0 = desligado, o valor por omissão). Apaga apenas pedidos TERMINAIS
     * (entregues ou cancelados) — um pedido em curso nunca é tocado.
     *
     * As duas operações são SQL em massa (uma instrução cada), não carregam
     * linhas para memória, e o `order_items` vai primeiro por causa da chave
     * estrangeira (fk_order_items_order, sem ON DELETE CASCADE).
     */

    /**
     * Apaga os itens dos pedidos a expurgar (antes das linhas de {@code orders}).
     *
     * <p>Consulta nativa: {@code OrderItem} não tem referência ao pedido (a
     * associação é unidireccional, com a chave em {@code order_items.order_id}),
     * por isso o JPQL não consegue navegar de item para pedido.</p>
     *
     * @param statuses nomes dos estados elegíveis (ex.: {@code ENTREGUE})
     * @return número de itens removidos
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "delete from order_items where order_id in "
            + "(select id from orders where status in (:statuses) and date < :cutoff)",
            nativeQuery = true)
    int deleteItemsOfOrdersOlderThan(
            @Param("statuses") Collection<String> statuses, @Param("cutoff") Instant cutoff);

    /**
     * Apaga os pedidos antigos nos estados elegíveis.
     *
     * @return número de pedidos removidos
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from Order o where o.status in :statuses and o.date < :cutoff")
    int deleteOrdersOlderThan(
            @Param("statuses") Collection<OrderStatus> statuses, @Param("cutoff") Instant cutoff);

    /**
     * O utilizador já comprou este produto? (para o selo "Compra verificada").
     *
     * <p>Pedidos cancelados não contam: o stock é reposto e a compra não
     * aconteceu, por isso não devem atribuir o selo.
     */
    @Query("select case when count(o) > 0 then true else false end "
            + "from Order o join o.items i "
            + "where o.userId = :userId and i.productId = :productId "
            + "and o.status <> mz.norteshopmoz.api.domain.OrderStatus.CANCELADO")
    boolean hasOrderedProduct(@Param("userId") String userId, @Param("productId") String productId);

    /* ── Estatísticas (agregação no SQL) ─────────────────────────────────────
     *
     * Antes, o painel de analytics carregava TODOS os pedidos com os itens
     * (EAGER) para somar em memória — um pico de memória e latência que crescia
     * com o histórico. Estas queries fazem a agregação na base de dados: o Java
     * só recebe os totais e um punhado de linhas.
     */

    /** Número de pedidos num estado (COUNT no índice de estado). */
    long countByStatus(OrderStatus status);

    /**
     * Número de pedidos nesses estados — a base do ticket médio.
     *
     * <p>O ticket médio divide a receita confirmada pelo número de pedidos que
     * a geraram. Usar o total de pedidos (incluindo cancelados e pedidos
     * offline ainda por pagar) misturava grandezas: bastavam muitos pedidos
     * "Pedido recebido" para o indicador desabar, apesar de a receita real não
     * ter mudado.</p>
     */
    long countByStatusIn(Collection<OrderStatus> statuses);

    /** Soma dos totais dos pedidos nesses estados. */
    @Query("select coalesce(sum(o.total), 0) from Order o where o.status in :statuses")
    BigDecimal sumTotalByStatusIn(@Param("statuses") Collection<OrderStatus> statuses);

    /** Soma dos portes cobrados nesses estados. */
    @Query("select coalesce(sum(o.shipping), 0) from Order o where o.status in :statuses")
    BigDecimal sumShippingByStatusIn(@Param("statuses") Collection<OrderStatus> statuses);

    /** Soma dos descontos concedidos nesses estados. */
    @Query("select coalesce(sum(o.discount), 0) from Order o where o.status in :statuses")
    BigDecimal sumDiscountByStatusIn(@Param("statuses") Collection<OrderStatus> statuses);

    /** Soma dos totais num estado (ex.: valor cancelado). */
    @Query("select coalesce(sum(o.total), 0) from Order o where o.status = :status")
    BigDecimal sumTotalByStatus(@Param("status") OrderStatus status);

    /**
     * Receita por produto, ordenada descendentemente. O {@code limit 5} é
     * aplicado pelo chamador — a lista tem no máximo uma linha por produto, não
     * uma por pedido.
     *
     * <p>Conta apenas os estados com pagamento confirmado ({@code paid}), os
     * mesmos que somam a receita do painel. Antes incluía qualquer pedido não
     * cancelado (logo, também os "Pedido recebido", ainda por pagar): o top de
     * produtos por receita podia então exceder a receita confirmada mostrada ao
     * lado, no mesmo painel.</p>
     *
     * <p>Inclui o {@code i.name} (o nome gravado no item, no momento da compra)
     * para o painel mostrar algo legível sem ter de resolver ids noutro pedido.</p>
     *
     * @return linhas {@code [productId, nome, receita]}
     */
    @Query("select i.productId, i.name, sum(i.price * i.qty) from Order o join o.items i "
            + "where o.status in :paid "
            + "group by i.productId, i.name order by sum(i.price * i.qty) desc")
    List<Object[]> topProductsByRevenue(@Param("paid") Collection<OrderStatus> paid);

    /**
     * Série diária: pedidos e receita confirmada por dia, mais recente primeiro.
     *
     * <p>Conta <strong>todos</strong> os pedidos do dia (como antes), mas só
     * soma a receita dos estados com pagamento confirmado ({@code paid}). O
     * agrupamento usa {@code year/month/day} (portável H2 ↔ PostgreSQL) em vez
     * de formatação de datas específica de cada motor.</p>
     *
     * @return linhas {@code [ano, mês, dia, nº pedidos, receita]}
     */
    @Query("select year(o.date), month(o.date), day(o.date), count(o), "
            + "coalesce(sum(case when o.status in :paid then o.total else 0 end), 0) "
            + "from Order o "
            + "group by year(o.date), month(o.date), day(o.date) "
            + "order by year(o.date) desc, month(o.date) desc, day(o.date) desc")
    List<Object[]> dailySeries(@Param("paid") Collection<OrderStatus> paid);
}
