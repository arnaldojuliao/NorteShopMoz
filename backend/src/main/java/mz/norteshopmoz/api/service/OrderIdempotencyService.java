package mz.norteshopmoz.api.service;

import java.time.Duration;
import java.util.List;
import mz.norteshopmoz.api.config.RedisCircuitBreaker;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.repository.OrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

/**
 * Idempotência de criação de pedidos (anti duplo-submit).
 *
 * <p>O checkout envia uma {@code Idempotency-Key} (UUID por sessão de finalização);
 * o servidor guarda {@code chave → id do pedido} no Redis durante 24h. Se a mesma
 * chave voltar (ex.: retry após falha de rede, duplo clique), devolve o pedido já
 * criado em vez de criar outro.
 *
 * <p><strong>Reserva atómica antes da cobrança.</strong> A versão anterior
 * verificava a chave com uma leitura ({@code GET}) e só a gravava depois de criar
 * o pedido. Duas tentativas concorrentes com a mesma chave passavam ambas pela
 * verificação e <em>ambas</em> chegavam a cobrar no gateway (duas cobranças para
 * um pedido). Agora a chave é reservada com {@code SET NX} <em>antes</em> da
 * cobrança ({@link #reserve}); a segunda tentativa falha a reserva, reconsulta o
 * pedido e, se este ainda não existir, recebe um 409 sem tocar no gateway. A
 * reserva é concluída com o id do pedido ({@link #complete}) ou libertada se a
 * operação falhar ({@link #release}) — nesse caso o valor só é apagado se ainda
 * estiver no estado {@code PENDING}, nunca um mapeamento para um pedido real.
 *
 * <p>Falha aberta: com o Redis indisponível, a idempotência é ignorada (a reserva
 * é concedida e o pedido é criado normalmente) — nunca bloqueia a loja.
 */
@Service
public class OrderIdempotencyService {

    private static final Logger log = LoggerFactory.getLogger(OrderIdempotencyService.class);
    private static final String KEY_PREFIX = "nsm:order:idem:";
    private static final Duration TTL = Duration.ofHours(24);

    /**
     * Valor de uma reserva em curso (ainda sem pedido associado). Distinto de
     * qualquer id de pedido real (os ids começam por {@code NSM-}).
     */
    private static final String PENDING = "pending";

    /** Liberta a chave apenas se ainda estiver em curso (nunca apaga um pedido já criado). */
    private static final String RELEASE_IF_PENDING_LUA = """
            local current = redis.call('GET', KEYS[1])
            if current == ARGV[1] then
                return redis.call('DEL', KEYS[1])
            end
            return 0
            """;

    private static final DefaultRedisScript<Long> RELEASE_IF_PENDING =
            new DefaultRedisScript<>(RELEASE_IF_PENDING_LUA, Long.class);

    private final StringRedisTemplate redis;
    private final OrderRepository orderRepository;
    private final RedisCircuitBreaker circuitBreaker;

    public OrderIdempotencyService(StringRedisTemplate redis, OrderRepository orderRepository,
            RedisCircuitBreaker circuitBreaker) {
        this.redis = redis;
        this.orderRepository = orderRepository;
        this.circuitBreaker = circuitBreaker;
    }

    /**
     * Se a chave já foi concluída, devolve o pedido correspondente (o mesmo pedido
     * da primeira tentativa) — ou null se a chave for nova ou estiver apenas
     * reservada (em processamento).
     */
    public Order findExisting(String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        // Circuito aberto → falha aberta sem tocar no Redis (evita esperar o
        // timeout em cada checkout enquanto o Redis estiver pendurado).
        if (!circuitBreaker.tryAcquire("idem:" + key)) {
            return null;
        }
        try {
            String value = redis.opsForValue().get(KEY_PREFIX + key);
            circuitBreaker.markSuccess();
            if (value == null || PENDING.equals(value)) {
                return null;
            }
            return orderRepository.findById(value).orElse(null);
        } catch (Exception e) {
            logRedisFailure(key, e);
            return null;
        }
    }

    /**
     * Reserva atómicamente a chave antes da cobrança ({@code SET NX}).
     *
     * @return {@code true} se reservou agora (primeira tentativa); {@code false}
     *         se já existe uma reserva em curso ou um pedido concluído para a
     *         chave — nesse caso o chamador NÃO deve cobrar.
     *         <p>Fail-open: com o Redis indisponível devolve {@code true} (deixa
     *         prosseguir), coerente com o resto do sistema.
     */
    public boolean reserve(String key) {
        if (key == null || key.isBlank()) {
            return true;
        }
        if (!circuitBreaker.tryAcquire("idem:" + key)) {
            return true;
        }
        try {
            Boolean acquired = redis.opsForValue().setIfAbsent(KEY_PREFIX + key, PENDING, TTL);
            circuitBreaker.markSuccess();
            return Boolean.TRUE.equals(acquired);
        } catch (Exception e) {
            logRedisFailure(key, e);
            return true;
        }
    }

    /** Conclui a reserva: associa a chave ao pedido criado (best-effort). */
    public void complete(String key, Order order) {
        if (key == null || key.isBlank() || order == null) {
            return;
        }
        if (!circuitBreaker.tryAcquire("idem:" + key)) {
            return;
        }
        try {
            redis.opsForValue().set(KEY_PREFIX + key, order.getId(), TTL);
            circuitBreaker.markSuccess();
        } catch (Exception e) {
            logRedisFailure(key, e);
        }
    }

    /**
     * Liberta uma reserva que não deu origem a pedido (ex.: validação ou
     * cobrança falhou), permitindo ao cliente tentar de novo com a mesma chave.
     * Só apaga se a chave ainda estiver em {@code PENDING}.
     */
    public void release(String key) {
        if (key == null || key.isBlank()) {
            return;
        }
        if (!circuitBreaker.tryAcquire("idem:" + key)) {
            return;
        }
        try {
            redis.execute(RELEASE_IF_PENDING, List.of(KEY_PREFIX + key), PENDING);
            circuitBreaker.markSuccess();
        } catch (Exception e) {
            logRedisFailure(key, e);
        }
    }

    /** Loga a falha (sem spam quando o circuito já está aberto) e alimenta o breaker. */
    private void logRedisFailure(String key, Exception e) {
        boolean justOpened = circuitBreaker.recordFailure(
                "idempotência (chave " + key + "): " + e.getMessage());
        if (!justOpened && !circuitBreaker.isOpen()) {
            log.warn("Idempotência indisponível (chave {}): {}", key, e.getMessage());
        }
    }
}
