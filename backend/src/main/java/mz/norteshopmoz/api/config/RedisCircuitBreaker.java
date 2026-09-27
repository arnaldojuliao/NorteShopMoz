package mz.norteshopmoz.api.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Circuit breaker para chamadas ao Redis nos caminhos "fail-open" (rate limit,
 * idempotência, sessões).
 *
 * <p><strong>Porquê existe</strong>: com o Redis pendurado (não recusando ligações
 * — ex.: rede a descartar pacotes, contentor pausado), cada chamada custava o
 * timeout completo (2 s). Um pedido autenticado fazia várias (idle touch,
 * revogação, rate limit), pelo que 100 pedidos simultâneos saturavam as 200
 * threads do Tomcat à espera do Redis — a API morria por latência, apesar de o
 * "fail-open" estar correto em semântica. O breaker abre após falhas seguidas,
 * dá as respostas fail-open SEM tocar no Redis durante a janela de abertura, e
 * deixa passar um pedido de sonda para recuperar quando o Redis volta.</p>
 *
 * <p>Meio-aberto: {@link #tryAcquire(String)} só deixa passar até
 * {@link #PROBE_CALLS} chamadas por janela de sonda — o resto falha aberto
 * imediatamente. Um sucesso fecha o circuito.</p>
 */
@Component
public class RedisCircuitBreaker {

    private static final Logger log = LoggerFactory.getLogger(RedisCircuitBreaker.class);

    /** Falhas seguidas antes de abrir o circuito. */
    private static final int FAILURE_THRESHOLD = 5;

    /** Tempo com o circuito aberto (sem tocar no Redis) antes de sondar de novo. */
    private static final long OPEN_WINDOW_MS = 10_000;

    /** Chamadas de sonda permitidas por janela quando o circuito está meio-aberto. */
    private static final int PROBE_CALLS = 1;

    private final AtomicInteger consecutiveFailures = new AtomicInteger();
    private final AtomicLong openedAt = new AtomicLong(0);
    /** Timestamp (ms) a partir do qual a sonda volta a ser permitida. */
    private volatile long probeAllowedAt = 0;
    private final AtomicInteger probeInFlight = new AtomicInteger();

    /**
     * Tenta obter autorização para chamar o Redis.
     *
     * @return true se a chamada pode prosseguir; false para falhar aberto já
     *         (sem tocar no Redis).
     */
    public boolean tryAcquire(String operationKey) {
        long now = System.currentTimeMillis();
        if (openedAt.get() == 0) {
            return true; // circuito fechado
        }
        if (now >= probeAllowedAt && probeInFlight.compareAndSet(0, 1)) {
            return true; // sonda meio-aberta
        }
        return false;
    }

    /** Registra sucesso — fecha o circuito e limpa contadores. */
    public void markSuccess() {
        int before = consecutiveFailures.getAndSet(0);
        long wasOpen = openedAt.getAndSet(0);
        if (wasOpen != 0) {
            log.info("Redis recuperado — circuit breaker fechado ({} falhas seguidas antes)", before);
        }
        probeInFlight.set(0);
    }

    /**
     * Registra uma falha. Quando o limiar é atingido, abre o circuito e devolve
     * true UMA vez (para o chamador registar o log de abertura sem spam por pedido).
     *
     * @param detail mensagem do erro (para o log de abertura)
     * @return true se o circuito ACABOU de abrir
     */
    public boolean recordFailure(String detail) {
        int failures = consecutiveFailures.incrementAndGet();
        if (failures == FAILURE_THRESHOLD) {
            openedAt.set(System.currentTimeMillis());
            probeAllowedAt = System.currentTimeMillis() + OPEN_WINDOW_MS;
            log.warn("Redis indisponível ({} falhas seguidas) — circuit breaker ABERTO por {} ms: "
                    + "pedidos seguem fail-open sem tocar no Redis. Última causa: {}",
                    failures, OPEN_WINDOW_MS, detail);
            return true;
        }
        return false;
    }

    /** true se o circuito está aberto ou meio-aberto (para logs/diagnóstico). */
    public boolean isOpen() {
        return openedAt.get() != 0;
    }
}
