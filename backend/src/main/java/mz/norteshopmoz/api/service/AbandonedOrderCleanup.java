package mz.norteshopmoz.api.service;

import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Expiração de pagamentos abandonados — cancela os pedidos em "Aguarda
 * pagamento" que passaram o prazo ({@code app.orders.payment-expiry-minutes},
 * 24 h por omissão; {@code 0} desliga).
 *
 * <p><strong>Porque existe:</strong> com o checkout hospedado o stock é
 * reservado na CRIAÇÃO do pedido e o pagamento só acontece fora da loja (página
 * do provedor). Um cliente que desista — ou que nunca receba o link — deixa o
 * stock bloqueado indefinidamente e o painel cheio de "Aguarda pagamento" sem
 * prazo. Este job fecha esses pedidos com o MESMO caminho de um cancelamento
 * manual ({@link OrderService#applyCancellation}): transição atómica, reposição
 * de stock e email de cancelamento — e é imune a corridas com um cliente que
 * pague no último minuto (quem confirma primeiro ganha; o outro caminho falha
 * na transição atómica).</p>
 *
 * <p>Corre de hora a hora (o prazo é em minutos, um job diário tornaria a
 * expiração imprecisa) com lock distribuído — com várias réplicas, só uma
 * executa.</p>
 */
@Component
public class AbandonedOrderCleanup {

    private static final Logger log = LoggerFactory.getLogger(AbandonedOrderCleanup.class);

    private final OrderService orderService;
    private final int expiryMinutes;

    public AbandonedOrderCleanup(
            OrderService orderService,
            @Value("${app.orders.payment-expiry-minutes:1440}") int expiryMinutes) {
        this.orderService = orderService;
        this.expiryMinutes = Math.max(0, expiryMinutes);
    }

    /** true quando há um prazo de pagamento configurado (minutos > 0). */
    public boolean isEnabled() {
        return expiryMinutes > 0;
    }

    @Scheduled(
            initialDelayString = "${app.orders.payment-expiry-initial-delay-ms:900000}", // 15 min
            fixedDelayString = "${app.orders.payment-expiry-check-ms:3600000}")            // 1 h
    @SchedulerLock(
            name = "abandonedOrderCleanup",
            lockAtMostFor = "PT10M",
            lockAtLeastFor = "PT1M")
    public void run() {
        if (!isEnabled()) {
            return;
        }
        try {
            int expired = orderService.expireStaleAwaitingPayment(
                    Instant.now().minus(Duration.ofMinutes(expiryMinutes)));
            if (expired > 0) {
                log.warn("Pagamentos expirados: {} pedido(s) em 'Aguarda pagamento' há mais de {} min "
                        + "foram cancelados e o stock reposto (PAYMENT_EXPIRY_MINUTES).",
                        expired, expiryMinutes);
            }
        } catch (RuntimeException e) {
            // O job nunca pode derrubar a API: loga e deixa a próxima hora tratar.
            log.error("Expiração de pagamentos abandonados falhou (repete na próxima hora)", e);
        }
    }
}
