package mz.norteshopmoz.api.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;

/**
 * Proteção contra brute-force no login.
 *
 * <p>São usados três contadores, com papéis diferentes (antes era apenas um por
 * IP e um por email, ambos com o mesmo limite):</p>
 *
 * <ol>
 *   <li><strong>Par (IP + email)</strong> — limite apertado ({@code max-attempts-pair},
 *       padrão 5). É esta a proteção principal: travão a força bruta contra uma
 *       conta a partir de uma origem, sem afectar mais ninguém.</li>
 *   <li><strong>Email</strong> — limite mais folgado ({@code max-attempts-email},
 *       padrão 15). Apanha ataques distribuídos (muitos IPs contra a mesma conta).
 *       É deliberadamente maior que o do par para que os erros de password de uma
 *       pessoa não trancem a própria conta de imediato.</li>
 *   <li><strong>IP</strong> — limite alto ({@code max-attempts-ip}, padrão 200).
 *       Só dispara com abuso real de um único endereço contra MUITAS contas.</li>
 * </ol>
 *
 * <p><strong>Porquê o par e não o IP</strong>: em Moçambique a maior parte do
 * tráfego vem de redes móveis atrás de CGNAT — milhares de clientes partilham o
 * mesmo endereço público. Com um limite de 20 falhas por IP (o que existia
 * antes), as passwords erradas de 20 pessoas trancavam o login de <em>todos</em>
 * os clientes daquele IP durante 5 minutos, em ciclo, sem o atacante precisar de
 * fazer nada de especial. Chavear o par isola cada cliente; o limite do IP ficou
 * só para sinal de abuso.</p>
 *
 * <p>Armazenado no Redis com TTL automático. Falha aberta: com o Redis
 * indisponível, permite o login (apenas registando aviso).</p>
 */
@Service
public class LoginAttemptService {

    private static final Logger log = LoggerFactory.getLogger(LoginAttemptService.class);

    private static final String KEY_PREFIX_PAIR = "nsm:auth:failed:pair:";
    private static final String KEY_PREFIX_EMAIL = "nsm:auth:failed:email:";
    private static final String KEY_PREFIX_IP = "nsm:auth:failed:ip:";
    private static final String KEY_PREFIX_LOCK_PAIR = "nsm:auth:lock:pair:";
    private static final String KEY_PREFIX_LOCK_EMAIL = "nsm:auth:lock:email:";
    private static final String KEY_PREFIX_LOCK_IP = "nsm:auth:lock:ip:";

    /**
     * INCR + PEXPIRE na MESMA operação (script Lua).
     *
     * <p>O padrão anterior incrementava e só depois, numa segunda chamada,
     * aplicava o TTL. Se essa segunda chamada falhasse (rede, restart), a chave
     * ficava <strong>sem TTL</strong> — e na instância de estado ({@code noeviction})
     * nunca expirava. O contador de IP não é limpo por um login válido (de
     * propósito): uma chave presa ficava a bloquear aquele IP <em>para sempre</em>
     * depois de atingir o limite — e em CGNAT (redes móveis) esse IP representa
     * milhares de clientes. Com o script, a chave nunca existe sem TTL.</p>
     */
    private static final String INCR_WINDOW_LUA = """
            local n = redis.call('INCR', KEYS[1])
            if n == 1 then
                redis.call('PEXPIRE', KEYS[1], ARGV[1])
            end
            return n
            """;

    private static final DefaultRedisScript<Long> INCR_WINDOW =
            new DefaultRedisScript<>(INCR_WINDOW_LUA, Long.class);

    private final int maxAttemptsPair;
    private final int maxAttemptsEmail;
    private final int maxAttemptsIp;
    private final int lockoutMinutes;
    private final int windowMinutes;

    private final StringRedisTemplate redis;

    public LoginAttemptService(
            StringRedisTemplate redis,
            @Value("${app.security.lockout.max-attempts-pair:5}") int maxAttemptsPair,
            @Value("${app.security.lockout.max-attempts-email:15}") int maxAttemptsEmail,
            @Value("${app.security.lockout.max-attempts-ip:200}") int maxAttemptsIp,
            @Value("${app.security.lockout.window-minutes:15}") int windowMinutes,
            @Value("${app.security.lockout.lockout-minutes:5}") int lockoutMinutes) {
        this.redis = redis;
        this.maxAttemptsPair = maxAttemptsPair;
        this.maxAttemptsEmail = maxAttemptsEmail;
        this.maxAttemptsIp = maxAttemptsIp;
        this.windowMinutes = windowMinutes;
        this.lockoutMinutes = lockoutMinutes;
    }

    /** Verifica se este (IP + email), a conta ou o IP estão bloqueados. */
    public boolean isBlocked(String ip, String email) {
        try {
            String normalized = normalize(email);
            return Boolean.TRUE.equals(redis.hasKey(lockPairKey(ip, normalized)))
                    || Boolean.TRUE.equals(redis.hasKey(KEY_PREFIX_LOCK_EMAIL + normalized))
                    || Boolean.TRUE.equals(redis.hasKey(KEY_PREFIX_LOCK_IP + ip));
        } catch (Exception e) {
            log.warn("Verificação de bloqueio indisponível: {}", e.getMessage());
            return false; // Falha aberta
        }
    }

    /** Regista uma tentativa falhada. Devolve true se o pedido deve ser bloqueado. */
    public boolean recordFailure(String ip, String email) {
        try {
            String normalized = normalize(email);
            Long pairCount = incrementWithWindow(KEY_PREFIX_PAIR + ip + ":" + normalized);
            Long emailCount = incrementWithWindow(KEY_PREFIX_EMAIL + normalized);
            Long ipCount = incrementWithWindow(KEY_PREFIX_IP + ip);

            boolean blockPair = pairCount != null && pairCount >= maxAttemptsPair;
            boolean blockEmail = emailCount != null && emailCount >= maxAttemptsEmail;
            boolean blockIp = ipCount != null && ipCount >= maxAttemptsIp;

            if (blockPair) {
                redis.opsForValue().set(lockPairKey(ip, normalized), "1", Duration.ofMinutes(lockoutMinutes));
                log.warn("Login bloqueado por {} min para o par IP+email ({} / {}) após {} tentativas",
                        lockoutMinutes, ip, normalized, pairCount);
            }
            if (blockEmail) {
                redis.opsForValue().set(KEY_PREFIX_LOCK_EMAIL + normalized, "1", Duration.ofMinutes(lockoutMinutes));
                log.warn("Login bloqueado por {} min para o email {} após {} tentativas (vários IPs)",
                        lockoutMinutes, normalized, emailCount);
            }
            if (blockIp) {
                redis.opsForValue().set(KEY_PREFIX_LOCK_IP + ip, "1", Duration.ofMinutes(lockoutMinutes));
                log.warn("Login bloqueado por {} min para o IP {} após {} tentativas (abuso em várias contas)",
                        lockoutMinutes, ip, ipCount);
            }

            return blockPair || blockEmail || blockIp;
        } catch (Exception e) {
            log.warn("Registo de tentativa falhada indisponível: {}", e.getMessage());
            return false; // Falha aberta
        }
    }

    /**
     * Login bem-sucedido: limpa os contadores da conta e do par, para que um
     * cliente que finalmente acertou não fique com o histórico.
     *
     * <p>NÃO limpa o contador do IP: este agrega falhas de contas diferentes e
     * seria trivial reiniciá-lo fazendo um login válido. Expiram pelo TTL.</p>
     */
    public void recordSuccess(String ip, String email) {
        try {
            String normalized = normalize(email);
            redis.delete(KEY_PREFIX_PAIR + ip + ":" + normalized);
            redis.delete(KEY_PREFIX_EMAIL + normalized);
        } catch (Exception e) {
            log.warn("Limpeza de contadores indisponível: {}", e.getMessage());
        }
    }

    /** Tentativas restantes para este (IP + email) — usada na mensagem ao utilizador. */
    public int getRemainingAttempts(String ip, String email) {
        try {
            String raw = redis.opsForValue().get(KEY_PREFIX_PAIR + ip + ":" + normalize(email));
            int used = raw != null ? Integer.parseInt(raw) : 0;
            return Math.max(0, maxAttemptsPair - used);
        } catch (Exception e) {
            return maxAttemptsPair; // Falha aberta
        }
    }

    /** Tempo restante de bloqueio em segundos (o maior entre par, email e IP). */
    public long getLockoutRemainingSeconds(String ip, String email) {
        try {
            String normalized = normalize(email);
            long pair = ttlSeconds(lockPairKey(ip, normalized));
            long emailTtl = ttlSeconds(KEY_PREFIX_LOCK_EMAIL + normalized);
            long ipTtl = ttlSeconds(KEY_PREFIX_LOCK_IP + ip);
            return Math.max(pair, Math.max(emailTtl, ipTtl));
        } catch (Exception e) {
            return 0;
        }
    }

    /**
     * Incrementa o contador e aplica-lhe a janela atomicamente (ver
     * {@link #INCR_WINDOW_LUA}).
     */
    private Long incrementWithWindow(String key) {
        return redis.execute(INCR_WINDOW, List.of(key),
                String.valueOf(Duration.ofMinutes(windowMinutes).toMillis()));
    }

    private long ttlSeconds(String key) {
        Long ttl = redis.getExpire(key, TimeUnit.SECONDS);
        return ttl != null && ttl > 0 ? ttl : 0;
    }

    private static String lockPairKey(String ip, String normalizedEmail) {
        return KEY_PREFIX_LOCK_PAIR + ip + ":" + normalizedEmail;
    }

    private static String normalize(String email) {
        return email == null ? "" : email.toLowerCase();
    }
}
