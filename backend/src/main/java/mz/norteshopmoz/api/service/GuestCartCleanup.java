package mz.norteshopmoz.api.service;

import java.time.Duration;
import java.time.Instant;
import mz.norteshopmoz.api.repository.CartRepository;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Expurgo dos carrinhos de <strong>convidado</strong> inativos.
 *
 * <p>Antes disto, `user_carts` só crescia: um visitante sem conta cria uma linha
 * no primeiro {@code PUT /api/cart} com o seu {@code X-Guest-Id}, e nunca havia
 * nada que a removesse (nem TTL, nem tarefa agendada). A maioria dos carrinhos
 * de convidado são sessões abandonadas — mantê-las para sempre é só volume e
 * custo de backup.</p>
 *
 * <p>Só apaga chaves com o prefixo {@code guest:}. Os carrinhos de contas
 * ({@code user_id} = id do utilizador) ficam sempre, porque pertencem ao
 * histórico de um cliente.</p>
 *
 * <p>Corre por omissão de 6 em 6 horas, com um atraso inicial de 10 minutos
 * (não atrasa o arranque nem compete com o seed do catálogo). É idempotente e
 * seguro de correr em paralelo com checkouts: o {@code updatedAt} é reposto em
 * cada escrita, por isso um carrinho em uso nunca é apanhado.</p>
 *
 * <p><strong>Teto absoluto.</strong> A retenção por idade não trava o abuso: o
 * {@code X-Guest-Id} é escolhido pelo cliente e cada valor novo cria uma linha,
 * pelo que um atacante gera centenas de milhares de carrinhos por dia (o expurgo
 * por idade só os apanharia semanas depois). Por isso há também um número máximo
 * de carrinhos de convidado ({@code app.cart.guest-max-count}): acima do teto, os
 * mais antigos são eliminados. Assim a tabela tem um limite superior absoluto e a
 * base de dados não pode encher por este caminho.</p>
 */
@Component
public class GuestCartCleanup {

    private static final Logger log = LoggerFactory.getLogger(GuestCartCleanup.class);

    /** Prefixo das chaves de carrinho de convidado (ver CartController). */
    private static final String GUEST_PREFIX = "guest:";

    private final CartRepository cartRepository;
    private final int retentionDays;
    private final boolean enabled;
    /** Teto de carrinhos de convidado (0 = sem teto; usa-se só a retenção por idade). */
    private final int maxCount;

    public GuestCartCleanup(
            CartRepository cartRepository,
            @Value("${app.cart.guest-retention-days:30}") int retentionDays,
            @Value("${app.cart.cleanup-enabled:true}") boolean enabled,
            @Value("${app.cart.guest-max-count:50000}") int maxCount) {
        this.cartRepository = cartRepository;
        this.retentionDays = retentionDays;
        this.enabled = enabled;
        this.maxCount = maxCount;
    }

    /** Apaga os carrinhos de convidado sem atividade há mais de {@code retentionDays}. */
    @Scheduled(
            initialDelayString = "${app.cart.cleanup-initial-delay-ms:600000}",  // 10 min
            fixedDelayString = "${app.cart.cleanup-interval-ms:21600000}")        // 6 h
    // Lock distribuído: com várias réplicas, só uma expurga por período.
    @SchedulerLock(
            name = "guestCartCleanup",
            lockAtMostFor = "PT30M",
            lockAtLeastFor = "PT1M")
    @Transactional
    public void purgeStaleGuestCarts() {
        if (!enabled) {
            return;
        }
        Instant cutoff = Instant.now().minus(Duration.ofDays(Math.max(1, retentionDays)));
        try {
            int removed = cartRepository.deleteGuestCartsOlderThan(GUEST_PREFIX + "%", cutoff);
            if (removed > 0) {
                log.info("Carrinhos de convidado expurgados: {} (inativos desde antes de {}).", removed, cutoff);
            }
        } catch (RuntimeException e) {
            // Nunca deixa a falha propagar para o agendador (uma exceção repetida
            // só polui logs; a próxima execução tenta de novo).
            log.warn("Falha ao expurgar carrinhos de convidado: {}", e.getMessage());
        }

        // Teto absoluto (ver o javadoc da classe): independente da idade, o número
        // de carrinhos de convidado nunca ultrapassa maxCount. Isolado do passo
        // anterior para uma falha de um não impedir o outro.
        if (maxCount > 0) {
            try {
                int trimmed = cartRepository.deleteGuestCartsBeyondMax(GUEST_PREFIX + "%", maxCount);
                if (trimmed > 0) {
                    log.warn("Carrinhos de convidado acima do teto ({}): {} mais antigos removidos.",
                            maxCount, trimmed);
                }
            } catch (RuntimeException e) {
                log.warn("Falha ao aplicar o teto de carrinhos de convidado: {}", e.getMessage());
            }
        }
    }
}
