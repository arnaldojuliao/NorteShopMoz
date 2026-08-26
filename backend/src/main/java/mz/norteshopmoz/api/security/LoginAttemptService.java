package mz.norteshopmoz.api.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

/**
 * Serviço de proteção contra brute-force: conta tentativas de login falhadas
 * por IP e por email, e bloqueia temporariamente após exceder o limite.
 * 
 * Armazenado no Redis com TTL automático.
 * Falha aberta: se Redis indisponível, permite login (apenas loga warn).
 */
@Service
public class LoginAttemptService {

    private static final Logger log = LoggerFactory.getLogger(LoginAttemptService.class);

    private static final String KEY_PREFIX_IP = "nsm:auth:failed:ip:";
    private static final String KEY_PREFIX_EMAIL = "nsm:auth:failed:email:";
    private static final String KEY_PREFIX_LOCK_IP = "nsm:auth:lock:ip:";
    private static final String KEY_PREFIX_LOCK_EMAIL = "nsm:auth:lock:email:";

    // Configuração
    private static final int MAX_ATTEMPTS_IP = 20;      // 20 tentativas por IP
    private static final int MAX_ATTEMPTS_EMAIL = 5;    // 5 tentativas por email
    private static final int LOCKOUT_MINUTES = 15;      // Bloqueio de 15 minutos
    private static final int WINDOW_MINUTES = 15;       // Janela de contagem: 15 min

    private final StringRedisTemplate redis;

    public LoginAttemptService(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** Verifica se o IP ou email está bloqueado. */
    public boolean isBlocked(String ip, String email) {
        try {
            String lockIpKey = KEY_PREFIX_LOCK_IP + ip;
            String lockEmailKey = KEY_PREFIX_LOCK_EMAIL + email.toLowerCase();
            
            Boolean ipLocked = redis.hasKey(lockIpKey);
            Boolean emailLocked = redis.hasKey(lockEmailKey);
            
            return Boolean.TRUE.equals(ipLocked) || Boolean.TRUE.equals(emailLocked);
        } catch (Exception e) {
            log.warn("Verificação de bloqueio indisponível: {}", e.getMessage());
            return false; // Falha aberta
        }
    }

    /** Regista uma tentativa falhada. Retorna true se deve bloquear. */
    public boolean recordFailure(String ip, String email) {
        try {
            String ipKey = KEY_PREFIX_IP + ip;
            String emailKey = KEY_PREFIX_EMAIL + email.toLowerCase();
            
            // Incrementa contadores
            Long ipCount = redis.opsForValue().increment(ipKey);
            Long emailCount = redis.opsForValue().increment(emailKey);
            
            // Define TTL na primeira tentativa
            if (ipCount != null && ipCount == 1) {
                redis.expire(ipKey, Duration.ofMinutes(WINDOW_MINUTES));
            }
            if (emailCount != null && emailCount == 1) {
                redis.expire(emailKey, Duration.ofMinutes(WINDOW_MINUTES));
            }
            
            // Verifica se deve bloquear
            boolean shouldBlockIp = ipCount != null && ipCount >= MAX_ATTEMPTS_IP;
            boolean shouldBlockEmail = emailCount != null && emailCount >= MAX_ATTEMPTS_EMAIL;
            
            if (shouldBlockIp) {
                String lockIpKey = KEY_PREFIX_LOCK_IP + ip;
                redis.opsForValue().set(lockIpKey, "1", Duration.ofMinutes(LOCKOUT_MINUTES));
                log.warn("IP {} bloqueado por {} minutos após {} tentativas falhadas", ip, LOCKOUT_MINUTES, ipCount);
            }
            if (shouldBlockEmail) {
                String lockEmailKey = KEY_PREFIX_LOCK_EMAIL + email.toLowerCase();
                redis.opsForValue().set(lockEmailKey, "1", Duration.ofMinutes(LOCKOUT_MINUTES));
                log.warn("Email {} bloqueado por {} minutos após {} tentativas falhadas", email, LOCKOUT_MINUTES, emailCount);
            }
            
            return shouldBlockIp || shouldBlockEmail;
        } catch (Exception e) {
            log.warn("Registo de tentativa falhada indisponível: {}", e.getMessage());
            return false; // Falha aberta
        }
    }

    /** Limpa contadores em login bem-sucedido. */
    public void recordSuccess(String ip, String email) {
        try {
            redis.delete(KEY_PREFIX_IP + ip);
            redis.delete(KEY_PREFIX_EMAIL + email.toLowerCase());
            // Não remove locks ativos — expiram naturalmente
        } catch (Exception e) {
            log.warn("Limpeza de contadores indisponível: {}", e.getMessage());
        }
    }

    /** Obtém tentativas restantes para exibição no frontend. */
    public int getRemainingAttempts(String ip, String email) {
        try {
            String ipKey = KEY_PREFIX_IP + ip;
            String emailKey = KEY_PREFIX_EMAIL + email.toLowerCase();
            
            String ipCountStr = redis.opsForValue().get(ipKey);
            String emailCountStr = redis.opsForValue().get(emailKey);
            
            int ipCount = ipCountStr != null ? Integer.parseInt(ipCountStr) : 0;
            int emailCount = emailCountStr != null ? Integer.parseInt(emailCountStr) : 0;
            
            int remainingIp = Math.max(0, MAX_ATTEMPTS_IP - ipCount);
            int remainingEmail = Math.max(0, MAX_ATTEMPTS_EMAIL - emailCount);
            
            return Math.min(remainingIp, remainingEmail);
        } catch (Exception e) {
            return MAX_ATTEMPTS_EMAIL; // Falha aberta
        }
    }

    /** Tempo restante de bloqueio em segundos. */
    public long getLockoutRemainingSeconds(String ip, String email) {
        try {
            String lockIpKey = KEY_PREFIX_LOCK_IP + ip;
            String lockEmailKey = KEY_PREFIX_LOCK_EMAIL + email.toLowerCase();
            
            Long ipTtl = redis.getExpire(lockIpKey, TimeUnit.SECONDS);
            Long emailTtl = redis.getExpire(lockEmailKey, TimeUnit.SECONDS);
            
            long ipRemaining = ipTtl != null && ipTtl > 0 ? ipTtl : 0;
            long emailRemaining = emailTtl != null && emailTtl > 0 ? emailTtl : 0;
            
            return Math.max(ipRemaining, emailRemaining);
        } catch (Exception e) {
            return 0;
        }
    }
}