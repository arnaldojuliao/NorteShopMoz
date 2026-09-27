package mz.norteshopmoz.api.config;

import io.lettuce.core.RedisConnectionException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Deteta no arranque — e depois periodicamente — que o Redis não está alcançável.
 *
 * <p><strong>Porquê</strong>: a aplicação falha aberta em todo o estado que vive
 * no Redis (rate limit, bloqueio de brute-force, inatividade de sessão, revogação
 * de refresh tokens, idempotência de pedidos e cache do catálogo). Isso é o
 * comportamento certo, mas tem um efeito perverso: um Redis inacessível
 * <em>não</em> produz nenhum erro de arranque — só degradação silenciosa. O pior
 * caso já observado: o contentor do Redis a correr <strong>sem endpoint na
 * rede</strong> (o Docker reverteu o endpoint ao falhar o mapeamento da porta, e
 * o healthcheck do contentor continuava "healthy" porque corre lá dentro), o que
 * deixou a loja a responder 500 em todos os pedidos durante 12 h sem nenhum
 * sinal visível no {@code docker compose ps}.</p>
 *
 * <p>Esta sonda separa as duas causas possíveis, porque a correção é diferente:
 * o <strong>nome do host não resolve</strong> (contentor fora da rede → resolve-se
 * reconectando o contentor com o alias) ou <strong>resolve mas não responde</strong>
 * (serviço parado, password errada, timeout). Regista no máximo uma mensagem por
 * transição de estado, para não encher o log a cada minuto.</p>
 *
 * <p>Não derruba o arranque de propósito: o desenho do projeto é degradar em vez
 * de não servir. Quem quiser bloquear o arranque tem o healthcheck de
 * <em>readiness</em> (que fica DOWN) e a verificação do {@code deploy.sh}.</p>
 */
@Component
public class RedisConnectivityProbe {

    private static final Logger log = LoggerFactory.getLogger(RedisConnectivityProbe.class);

    private final StringRedisTemplate redis;
    private final String host;
    private final int port;

    /** Estado observado na última sonda; as mensagens só saem quando muda. */
    private final AtomicBoolean reachable = new AtomicBoolean(true);
    private volatile boolean probed;

    public RedisConnectivityProbe(
            StringRedisTemplate redis,
            @Value("${spring.data.redis.host:localhost}") String host,
            @Value("${spring.data.redis.port:6381}") int port) {
        this.redis = redis;
        this.host = host;
        this.port = port;
    }

    /** Primeira sonda: corre quando a aplicação está pronta a servir. */
    @EventListener(ApplicationReadyEvent.class)
    public void probeOnStartup() {
        probe("arranque");
    }

    /**
     * Sonda periódica: apanha o Redis que cai (ou é reconectado à rede) <em>depois</em>
     * do arranque, que é o que acontece numa janela de manutenção ou num
     * contentor recriado.
     */
    // SEM @SchedulerLock de propósito: cada réplica tem de verificar a SUA
    // própria ligação ao Redis. Bloquear a sonda entre réplicas esconderia a
    // réplica que perdeu o acesso (uma sonda alheia a passar não a salva).
    @Scheduled(
            initialDelayString = "${app.redis.probe-interval-ms:60000}",
            fixedDelayString = "${app.redis.probe-interval-ms:60000}")
    public void probePeriodically() {
        probe("verificação periódica");
    }

    /** true se a última sonda alcançou o Redis. */
    public boolean isReachable() {
        return reachable.get();
    }

    private void probe(String trigger) {
        String problem = diagnose();
        boolean firstProbe = !probed;
        probed = true;

        if (problem == null) {
            if (firstProbe || !reachable.getAndSet(true)) {
                log.info("Redis alcançável em {}:{} ({}).", host, port, trigger);
            }
            return;
        }

        // Só a transição para "inacessível" (ou a primeira sonda) gera o
        // diagnóstico completo — repetir de minuto a minuto não acrescenta nada.
        if (!firstProbe && !reachable.getAndSet(false)) {
            return;
        }
        reachable.set(false);
        log.error("Redis INACESSÍVEL em {}:{} — {}.", host, port, problem);
        log.error("A aplicação arranca em modo degradado: rate limit, bloqueio de brute-force, "
                + "inatividade de sessão, revogação de refresh tokens, idempotência de pedidos e "
                + "cache do catálogo ficam DESLIGADOS (fail-open). O /actuator/health "
                + "(readiness) fica DOWN.");
        if (problem.startsWith("o nome")) {
            log.error("Causa mais provável: o contentor do Redis está a correr SEM endpoint na "
                    + "rede do projeto (o healthcheck do contentor continua 'healthy'). Confirme "
                    + "com 'docker exec <contentor-da-api> getent hosts {}' e corrija com "
                    + "'./scripts/docker-net-check.sh --fix'.", host);
        }
    }

    /**
     * Diagnóstico do estado do Redis: {@code null} quando alcançável, caso
     * contrário a descrição do problema (sem pontuação final).
     *
     * <p>O DNS é verificado antes da ligação porque é o que distingue o incidente
     * do contentor fora da rede (nome que não resolve) de um Redis parado.</p>
     */
    String diagnose() {
        try {
            InetAddress.getByName(host);
        } catch (UnknownHostException | SecurityException e) {
            return "o nome '" + host + "' não se resolve (" + e.getClass().getSimpleName() + ")";
        }
        try {
            String pong = redis.execute((RedisCallback<String>) RedisConnection::ping);
            if (pong == null) {
                return "ligou mas não respondeu ao PING";
            }
            return null;
        } catch (RedisConnectionException e) {
            return "resolve mas não aceita ligações (" + rootCause(e) + ")";
        } catch (RuntimeException e) {
            return "falhou a ligação (" + rootCause(e) + ")";
        }
    }

    private static String rootCause(Throwable e) {
        Throwable cause = e;
        while (cause.getCause() != null && cause.getCause() != cause) {
            cause = cause.getCause();
        }
        String message = cause.getMessage();
        return message == null || message.isBlank()
                ? cause.getClass().getSimpleName()
                : cause.getClass().getSimpleName() + ": " + message;
    }
}
