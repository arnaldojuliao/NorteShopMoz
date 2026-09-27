package mz.norteshopmoz.api.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import mz.norteshopmoz.api.repository.OrderRepository;
import mz.norteshopmoz.api.repository.UserRepository;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Manutenção periódica: sessões órfãs e chaves obsoletas no Redis + dados
 * expirados na base de dados.
 *
 * <p>Todo o estado no Redis já tem TTL, mas há dois casos que o TTL não limpa
 * bem:</p>
 * <ul>
 *   <li><strong>Conjuntos de refresh tokens vazios:</strong> a chave é
 *       {@code nsm:auth:refresh:<userId>} (um SET). Cada logout de dispositivo ou
 *       rotação remove um membro; quando o último sai, o SET fica vazio e a chave
 *       só desaparece no fim dos 30 dias. Sobram chaves sem conteúdo.</li>
 *   <li><strong>Sessões de contas que já não existem:</strong> o conjunto (e o
 *       marcador de revogação) sobrevive à conta. São sessões órfãs — não
 *       pertencem a ninguém e nunca mais são usadas.</li>
 *   <li><strong>Chaves de idempotência que apontam para pedidos que já não
 *       existem</strong> (ex.: pedido removido em manutenção): a chave passaria
 *       os 24h a devolver {@code null} para um pedido inexistente.</li>
 * </ul>
 *
 * <p>Usa {@code SCAN} (nunca {@code KEYS}, que bloqueia o Redis) e é limitado por
 * execução ({@code idempotency-max-keys}) para não fazer uma varredura pesada
 * numa instância grande. Falhas em cada passo são isoladas: um erro não impede os
 * restantes nem rebenta o agendador.</p>
 */
@Component
public class MaintenanceCleanup {

    private static final Logger log = LoggerFactory.getLogger(MaintenanceCleanup.class);

    /** Registo de refresh tokens por utilizador (SET). */
    private static final String REFRESH_PREFIX = "nsm:auth:refresh:";
    /** Idempotência do checkout: chave → id do pedido. */
    private static final String IDEMPOTENCY_PREFIX = "nsm:order:idem:";

    private static final int SCAN_COUNT = 500;

    private final StringRedisTemplate redis;
    private final UserRepository userRepository;
    private final OrderRepository orderRepository;
    private final OrphanDataCleanup orphanDataCleanup;
    private final OrderRetentionCleanup orderRetentionCleanup;
    private final boolean enabled;
    private final int idempotencyMaxKeys;

    public MaintenanceCleanup(
            StringRedisTemplate redis,
            UserRepository userRepository,
            OrderRepository orderRepository,
            OrphanDataCleanup orphanDataCleanup,
            OrderRetentionCleanup orderRetentionCleanup,
            @Value("${app.maintenance.enabled:true}") boolean enabled,
            @Value("${app.maintenance.idempotency-max-keys:2000}") int idempotencyMaxKeys) {
        this.redis = redis;
        this.userRepository = userRepository;
        this.orderRepository = orderRepository;
        this.orphanDataCleanup = orphanDataCleanup;
        this.orderRetentionCleanup = orderRetentionCleanup;
        this.enabled = enabled;
        this.idempotencyMaxKeys = Math.max(1, idempotencyMaxKeys);
    }

    /** Corre todos os expurgos, isolando falhas de cada um. */
    @Scheduled(
            initialDelayString = "${app.maintenance.initial-delay-ms:900000}",   // 15 min
            fixedDelayString = "${app.maintenance.interval-ms:86400000}")         // 24 h
    // Lock distribuído: com várias réplicas, só uma corre a manutenção por dia.
    @SchedulerLock(
            name = "maintenanceCleanup",
            lockAtMostFor = "PT30M",   // rede de segurança > duração esperada
            lockAtLeastFor = "PT1M")   // evita re-execução imediata noutra réplica
    public void run() {
        if (!enabled) {
            return;
        }
        safely("dados órfãos na base de dados", () -> orphanDataCleanup.purge());
        safely("retenção de pedidos antigos", () -> orderRetentionCleanup.purge());
        safely("chaves de sessão órfãs no Redis", this::purgeOrphanSessionKeys);
        safely("chaves de idempotência obsoletas no Redis", this::purgeStaleIdempotencyKeys);
    }

    /**
     * Remove conjuntos de refresh tokens vazios e os de contas que já não existem.
     *
     * @return número de chaves removidas
     */
    public long purgeOrphanSessionKeys() {
        long removed = 0;
        try (Cursor<String> cursor = redis.scan(scanOptions(REFRESH_PREFIX + "*"))) {
            while (cursor.hasNext()) {
                String key = cursor.next();
                if (key == null || key.length() <= REFRESH_PREFIX.length()) {
                    continue;
                }
                String userId = key.substring(REFRESH_PREFIX.length());
                Long size = redis.opsForSet().size(key);
                if (size == null || size == 0 || !userRepository.existsById(userId)) {
                    redis.delete(key);
                    removed++;
                }
            }
        }
        if (removed > 0) {
            log.info("Chaves de sessão órfãs removidas do Redis: {}.", removed);
        }
        return removed;
    }

    /**
     * Remove chaves de idempotência sem valor ou que apontam para pedidos que já
     * não existem. Limitado a {@code idempotency-max-keys} por execução.
     *
     * @return número de chaves removidas
     */
    public long purgeStaleIdempotencyKeys() {
        Map<String, String> keyToOrder = new HashMap<>();
        List<String> withoutValue = new ArrayList<>();

        try (Cursor<String> cursor = redis.scan(scanOptions(IDEMPOTENCY_PREFIX + "*"))) {
            while (cursor.hasNext() && keyToOrder.size() < idempotencyMaxKeys) {
                String key = cursor.next();
                String orderId = redis.opsForValue().get(key);
                if (orderId == null || orderId.isBlank()) {
                    // Sem valor não há idempotência nenhuma a preservar.
                    withoutValue.add(key);
                } else {
                    keyToOrder.put(key, orderId);
                }
            }
        }

        long removed = withoutValue.size();
        if (!withoutValue.isEmpty()) {
            redis.delete(withoutValue);
        }
        if (!keyToOrder.isEmpty()) {
            Set<String> existing = new HashSet<>();
            orderRepository.findAllById(new HashSet<>(keyToOrder.values()))
                    .forEach(order -> existing.add(order.getId()));
            List<String> stale = keyToOrder.entrySet().stream()
                    .filter(entry -> !existing.contains(entry.getValue()))
                    .map(Map.Entry::getKey)
                    .toList();
            if (!stale.isEmpty()) {
                redis.delete(stale);
                removed += stale.size();
            }
        }

        if (removed > 0) {
            log.info("Chaves de idempotência obsoletas removidas do Redis: {}.", removed);
        }
        return removed;
    }

    private static ScanOptions scanOptions(String pattern) {
        return ScanOptions.scanOptions().match(pattern).count(SCAN_COUNT).build();
    }

    /** Corre uma ação isolando qualquer falha (nunca propaga para o agendador). */
    private static void safely(String label, Runnable action) {
        try {
            action.run();
        } catch (RuntimeException e) {
            log.warn("Falha na manutenção ({}): {}", label, e.getMessage());
        }
    }
}
