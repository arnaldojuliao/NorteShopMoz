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
 * Travão dos emails disparados por endpoints <strong>públicos</strong>.
 *
 * <p><strong>Porquê existe</strong>: três endpoints enviam email para um endereço
 * que o <em>pedido</em> indica, sem exigir conta:</p>
 * <ul>
 *   <li>{@code POST /api/auth/register} — cria a conta e envia a verificação para
 *       o email do payload;</li>
 *   <li>{@code POST /api/auth/forgot-password} — envia o link de reposição;</li>
 *   <li>{@code POST /api/auth/resend-verification} — reenvia a verificação.</li>
 * </ul>
 *
 * <p>O único limite era o rate limit por IP+path (30/min). Isso não protege nada
 * contra um atacante com uma lista de endereços — e o custo não é do atacante, é
 * da loja, em três frentes:</p>
 * <ol>
 *   <li><strong>a cota do fornecedor de email</strong> (centenas ou milhares de
 *       envios por mês) é queimada por mensagens que ninguém pediu, e os clientes
 *       <em>reais</em> deixam de receber a confirmação do pedido e a reposição da
 *       palavra-passe — uma avaria invisível, porque a loja continua a vender;</li>
 *   <li><strong>a reputação do domínio</strong>: milhares de mensagens de
 *       verificação para endereços que nunca se registaram levam os
 *       fornecedores a marcar o remetente como spam — e recuperar isso demora
 *       meses;</li>
 *   <li>a tabela de utilizadores enche-se de contas de lixo.</li>
 * </ol>
 *
 * <p><strong>Por endereço e global.</strong> O teto por endereço trava o bombardeio
 * dirigido a uma caixa de correio — que é também o teto que o utilizador legítimo
 * sente, por isso é folgado (3 por hora) e a mensagem diz exatamente o que fazer.
 * O teto global é o travão de anomalia: se a loja dispara mais de N emails por
 * hora a partir de pedidos públicos, algo está automatizado.</p>
 *
 * <p>Só conta envios que <strong>acontecem</strong> ({@link #recordSent} é chamado
 * no ponto de envio), e falha aberta: com o Redis indisponível, o pedido segue
 * (com aviso) — a loja nunca deixa de registar clientes por causa de um contador
 * acessório.</p>
 */
@Service
public class EmailThrottleService {

    /** Resumo do endereço normalizado (nunca o email em claro numa chave de Redis). */
    private static final String ADDRESS_PREFIX = "nsm:mail:addr:";
    private static final String GLOBAL_PREFIX = "nsm:mail:global:";

    private static final String SCOPE = "Travão de emails públicos";

    private static final DateTimeFormatter HOUR_FORMAT = DateTimeFormatter.ofPattern("yyyyMMddHH");

    private final RedisCounterThrottle counters;
    private final boolean enabled;
    private final int maxPerAddress;
    private final Duration addressWindow;
    private final int maxGlobalPerHour;

    public EmailThrottleService(
            RedisCounterThrottle counters,
            @Value("${app.email-throttle.enabled:true}") boolean enabled,
            @Value("${app.email-throttle.max-per-address:3}") int maxPerAddress,
            @Value("${app.email-throttle.address-window-minutes:60}") int addressWindowMinutes,
            @Value("${app.email-throttle.max-global-per-hour:500}") int maxGlobalPerHour) {
        this.counters = counters;
        this.enabled = enabled;
        this.maxPerAddress = Math.max(1, maxPerAddress);
        this.addressWindow = Duration.ofMinutes(Math.max(1, addressWindowMinutes));
        this.maxGlobalPerHour = Math.max(1, maxGlobalPerHour);
    }

    /**
     * Recusa o envio quando o endereço (ou a loja) já atingiu o teto.
     * Apenas lê os contadores — não gasta quota de ninguém.
     *
     * @throws ApiException 429 quando o limite é atingido
     */
    public void assertAllowed(String email) {
        if (!enabled) {
            return;
        }
        String address = addressKey(email);
        if (address != null
                && counters.read(ADDRESS_PREFIX + address, SCOPE) >= maxPerAddress) {
            throw ApiException.tooManyRequests(
                    "Já pedimos vários emails para este endereço. Aguarde "
                            + addressWindow.toMinutes() + " minutos e verifique a caixa de entrada "
                            + "(incluindo o correio não desejado).");
        }
        if (counters.read(GLOBAL_PREFIX + hourlyBucket(), SCOPE) >= maxGlobalPerHour) {
            throw ApiException.tooManyRequests(
                    "A loja está a enviar um volume invulgar de emails. Tente novamente dentro de "
                            + "alguns minutos ou contacte o apoio ao cliente.");
        }
    }

    /** Regista um email efetivamente enviado (best-effort, nunca lança). */
    public void recordSent(String email) {
        if (!enabled) {
            return;
        }
        String address = addressKey(email);
        if (address != null) {
            counters.increment(ADDRESS_PREFIX + address, addressWindow, SCOPE);
        }
        counters.increment(GLOBAL_PREFIX + hourlyBucket(), Duration.ofHours(1).plusMinutes(1), SCOPE);
    }

    /** Chave do endereço: resumo SHA-256 do email normalizado. */
    private static String addressKey(String email) {
        if (email == null || email.isBlank()) {
            return null;
        }
        return RedisCounterThrottle.digest("email:" + email.trim().toLowerCase(Locale.ROOT));
    }

    private static String hourlyBucket() {
        return ZonedDateTime.ofInstant(Instant.now(), ZoneOffset.UTC).format(HOUR_FORMAT);
    }
}
