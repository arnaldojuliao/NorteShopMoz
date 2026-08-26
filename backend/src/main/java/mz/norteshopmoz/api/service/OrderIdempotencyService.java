package mz.norteshopmoz.api.service;

import java.time.Duration;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.repository.OrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * Idempotência de criação de pedidos (anti duplo-submit).
 *
 * <p>O checkout envia uma {@code Idempotency-Key} (UUID por sessão de finalização);
 * o servidor guarda {@code chave → id do pedido} no Redis durante 24h. Se a mesma
 * chave voltar (ex.: retry após falha de rede, duplo clique), devolve o pedido já
 * criado em vez de criar outro.
 *
 * <p>Falha aberta: com o Redis indisponível, a idempotência é ignorada (o pedido é
 * criado normalmente) — nunca bloqueia a loja. A chave só é consumida após o pedido
 * ser persistido, então uma falha a meio não deixa chave órfã a apontar para nada.
 */
@Service
public class OrderIdempotencyService {

    private static final Logger log = LoggerFactory.getLogger(OrderIdempotencyService.class);
    private static final String KEY_PREFIX = "nsm:order:idem:";
    private static final Duration TTL = Duration.ofHours(24);

    private final StringRedisTemplate redis;
    private final OrderRepository orderRepository;

    public OrderIdempotencyService(StringRedisTemplate redis, OrderRepository orderRepository) {
        this.redis = redis;
        this.orderRepository = orderRepository;
    }

    /**
     * Se a chave já foi usada, devolve o pedido correspondente (o mesmo pedido da
     * primeira tentativa) — ou null se a chave for nova.
     */
    public Order findExisting(String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        try {
            String orderId = redis.opsForValue().get(KEY_PREFIX + key);
            if (orderId == null) {
                return null;
            }
            return orderRepository.findById(orderId).orElse(null);
        } catch (Exception e) {
            log.warn("Idempotência indisponível (chave {}): {}", key, e.getMessage());
            return null;
        }
    }

    /** Regista a chave → pedido após a criação (best-effort). */
    public void remember(String key, Order order) {
        if (key == null || key.isBlank()) {
            return;
        }
        try {
            redis.opsForValue().set(KEY_PREFIX + key, order.getId(), TTL);
        } catch (Exception e) {
            log.warn("Não foi possível guardar a chave de idempotência {}: {}", key, e.getMessage());
        }
    }
}
