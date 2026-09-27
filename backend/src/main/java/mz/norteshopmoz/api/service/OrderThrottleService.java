package mz.norteshopmoz.api.service;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import mz.norteshopmoz.api.config.RedisCounterThrottle;
import mz.norteshopmoz.api.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Travão do checkout público ({@code POST /api/orders}).
 *
 * <p><strong>Porquê existe</strong>: o checkout é público (aceita convidados), não
 * passa por CSRF e não exige conta. Cada pedido criado tem dois efeitos reais:</p>
 * <ol>
 *   <li>desconta <strong>stock verdadeiro</strong> ({@code decrementStockAndSold});</li>
 *   <li>dispara um email de confirmação para o endereço escolhido pelo cliente —
 *       ou seja, um script pode usar a loja como <em>relay de spam</em>, com a
 *       chave do Resend e a reputação do domínio da loja.</li>
 * </ol>
 *
 * <p>Um script sem conta criava pedidos sem limite prático: o rate limit
 * ({@code anon-api}) é por <strong>IP</strong> e em Moçambique milhares de
 * clientes partilham o mesmo IP público (CGNAT das operadoras móveis) — apertá-lo
 * bloquearia vendas legítimas. Este limite é por <strong>contacto</strong>
 * (email/telefone) e por janela global, que protege o stock e o email sem punir
 * quem está atrás de um IP partilhado.</p>
 *
 * <p><strong>Só conta pedidos criados com sucesso</strong> ({@link #recordCreated}):
 * um cliente que tentou 3 vezes com um cartão errado não fica bloqueado — as
 * tentativas falhadas não gastam quota. A verificação ({@link #assertAllowed}) é
 * uma leitura, para recusar <em>antes</em> de a transação de escrita começar.</p>
 *
 * <p><strong>Falha aberta</strong>: com o Redis indisponível, o pedido passa — a
 * loja nunca fecha por causa de um travão acessório (ver
 * {@link RedisCounterThrottle}). O contacto é guardado como resumo SHA-256, nunca
 * em claro.</p>
 */
@Service
public class OrderThrottleService {

    private static final String CONTACT_PREFIX = "nsm:orders:contact:";
    private static final String GLOBAL_PREFIX = "nsm:orders:global:";

    private static final String SCOPE = "Travão do checkout";

    /** Hora cheia em UTC (ex.: {@code 2026092315}) — chave do travão global. */
    private static final DateTimeFormatter HOUR_FORMAT = DateTimeFormatter.ofPattern("yyyyMMddHH");

    private final RedisCounterThrottle counters;
    private final boolean enabled;
    private final int maxPerContact;
    private final Duration contactWindow;
    private final int maxGlobalPerHour;

    public OrderThrottleService(
            RedisCounterThrottle counters,
            @Value("${app.orders.throttle.enabled:true}") boolean enabled,
            @Value("${app.orders.throttle.max-per-contact:3}") int maxPerContact,
            @Value("${app.orders.throttle.contact-window-minutes:60}") int contactWindowMinutes,
            @Value("${app.orders.throttle.max-global-per-hour:1000}") int maxGlobalPerHour) {
        this.counters = counters;
        this.enabled = enabled;
        this.maxPerContact = Math.max(1, maxPerContact);
        this.contactWindow = Duration.ofMinutes(Math.max(1, contactWindowMinutes));
        this.maxGlobalPerHour = Math.max(1, maxGlobalPerHour);
    }

    /**
     * Recusa o checkout quando o contacto (ou a loja) já atingiu o teto.
     *
     * <p>Apenas lê os contadores — não os incrementa: as tentativas falhadas não
     * devem gastar quota de ninguém.</p>
     *
     * @param email email do comprador (pode vir vazio)
     * @param phone telefone do comprador (alternativa ao email)
     * @throws ApiException 429 quando o limite é atingido
     */
    public void assertAllowed(String email, String phone) {
        if (!enabled) {
            return;
        }
        String contact = contactKey(email, phone);
        if (contact != null
                && counters.read(CONTACT_PREFIX + contact, SCOPE) >= maxPerContact) {
            throw ApiException.tooManyRequests(
                    "Limite de pedidos atingido para este contacto. Aguarde "
                            + contactWindow.toMinutes() + " minutos ou contacte o apoio ao cliente.");
        }
        if (counters.read(GLOBAL_PREFIX + hourlyBucket(), SCOPE) >= maxGlobalPerHour) {
            throw ApiException.tooManyRequests(
                    "A loja está a receber um volume invulgar de pedidos. Tente novamente dentro de "
                            + "alguns minutos.");
        }
    }

    /**
     * Regista um pedido criado com sucesso (best-effort, chamado após o commit).
     *
     * <p>Se este registo falhar, o pedido existe e o cliente fica servido: o
     * contador perde uma unidade, o que no pior caso deixa passar um pedido a mais.
     * Preferível a bloquear uma venda por causa de um contador.</p>
     */
    public void recordCreated(String email, String phone) {
        if (!enabled) {
            return;
        }
        String contact = contactKey(email, phone);
        if (contact != null) {
            counters.increment(CONTACT_PREFIX + contact, contactWindow, SCOPE);
        }
        counters.increment(GLOBAL_PREFIX + hourlyBucket(), Duration.ofHours(1).plusMinutes(1), SCOPE);
    }

    /**
     * Chave do contacto: resumo SHA-256 do email normalizado (ou, sem email, dos
     * dígitos do telefone). {@code null} sem contacto nenhum — nesse caso só o
     * travão global se aplica.
     */
    private static String contactKey(String email, String phone) {
        if (email != null && !email.isBlank()) {
            return RedisCounterThrottle.digest("email:" + email.trim().toLowerCase(Locale.ROOT));
        }
        if (phone != null) {
            String digits = phone.replaceAll("[^0-9]", "");
            if (!digits.isEmpty()) {
                return RedisCounterThrottle.digest("phone:" + digits);
            }
        }
        return null;
    }

    /** Janela global de hora cheia — chave por hora (UTC, para não depender do fuso do servidor). */
    private static String hourlyBucket() {
        return ZonedDateTime.ofInstant(Instant.now(), ZoneOffset.UTC).format(HOUR_FORMAT);
    }
}
