package mz.norteshopmoz.api.service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import mz.norteshopmoz.api.domain.OrderStatus;
import mz.norteshopmoz.api.repository.OrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Expurgo de pedidos antigos (retenção de dados) — <strong>desligado por
 * omissão</strong>.
 *
 * <p>Os pedidos acumulam-se para sempre: o {@code OrphanDataCleanup} só trata de
 * tokens expirados, favoritos/moradas/carrinhos órfãos, e o
 * {@code MaintenanceCleanup} só de chaves do Redis. Nada apagava pedidos — num
 * checkout público sem conta (ver {@code OrderThrottleService}) isto é o que
 * permite que uma campanha de pedidos falsos deixe a tabela a crescer sem fim.</p>
 *
 * <p><strong>Porque é que só apaga pedidos terminais:</strong> um pedido
 * {@code ENTREGUE} ou {@code CANCELADO} já não vai mudar de estado, já não reserva
 * stock e já não gera email — é histórico. Um pedido em curso (recebido, em
 * preparação, enviado, em trânsito) tem valor operacional: apagá-lo deixaria o
 * cliente sem forma de acompanhar a compra e o stock sem correspondência.</p>
 *
 * <p><strong>Retenção por omissão de 730 dias</strong> (~2 anos):
 * {@code app.orders.retention-days}. Sem expurgo a tabela cresce para sempre e,
 * num VPS único, o disco cheio para o PostgreSQL — a loja deixa de aceitar
 * pedidos. O valor é configurável e {@code 0} desliga o expurgo por completo
 * (mantém todo o histórico), para quem tenha obrigações de conservação
 * (fiscais/contabilidade). Cada execução registra um WARN com o número de
 * pedidos apagados.</p>
 */
@Component
public class OrderRetentionCleanup {

    private static final Logger log = LoggerFactory.getLogger(OrderRetentionCleanup.class);

    /**
     * Estados elegíveis: o pedido terminou e nada mais lhe acontece.
     * (Uma entrega cancelada depois de entregue não existe no domínio — ver
     * {@code OrderService.applyCancellation}, que recusa cancelar entregues.)
     */
    private static final List<OrderStatus> TERMINAL_STATUSES =
            List.of(OrderStatus.ENTREGUE, OrderStatus.CANCELADO);

    private final OrderRepository orderRepository;
    private final int retentionDays;

    public OrderRetentionCleanup(
            OrderRepository orderRepository,
            @Value("${app.orders.retention-days:730}") int retentionDays) {
        this.orderRepository = orderRepository;
        this.retentionDays = Math.max(0, retentionDays);
    }

    /** true quando há uma retenção configurada (dias > 0). */
    public boolean isEnabled() {
        return retentionDays > 0;
    }

    /**
     * Apaga os pedidos terminais mais antigos do que a retenção configurada.
     *
     * <p>Bean separado de propósito (como o {@code OrphanDataCleanup}): as duas
     * operações têm de correr na <em>mesma</em> transação — itens primeiro (chave
     * estrangeira), depois os pedidos — e uma chamada a um método
     * {@code @Transactional} do próprio bean não passa pelo proxy.</p>
     *
     * @return número de pedidos removidos (0 se a retenção estiver desligada)
     */
    @Transactional
    public int purge() {
        if (!isEnabled()) {
            return 0;
        }
        Instant cutoff = Instant.now().minus(Duration.ofDays(retentionDays));
        int items = orderRepository.deleteItemsOfOrdersOlderThan(
                TERMINAL_STATUSES.stream().map(Enum::name).toList(), cutoff);
        int orders = orderRepository.deleteOrdersOlderThan(TERMINAL_STATUSES, cutoff);
        if (orders > 0) {
            log.warn("Retenção de pedidos: apagados {} pedidos terminais (entregues/cancelados) mais antigos "
                    + "do que {} dias ({} linhas de itens). Definido por ORDERS_RETENTION_DAYS.",
                    orders, retentionDays, items);
        }
        return orders;
    }
}
