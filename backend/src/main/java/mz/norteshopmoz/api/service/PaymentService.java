package mz.norteshopmoz.api.service;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.web.dto.OrderRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Registos e validação de métodos de pagamento.
 *
 * <p>Espelha o checkout do frontend. Métodos pagos online (M-Pesa, e-Mola,
 * cartão) passam pelo {@link PaymentGateway} — hoje simulado; os restantes
 * (pagamento na entrega, transferência) não são cobrados aqui e começam o
 * pedido em "Pedido recebido".</p>
 *
 * <p>O gateway é resolvido por {@link ObjectProvider}: com {@code app.payments.mode=live}
 * e nenhum gateway real configurado, a aplicação continua a arrancar (métodos
 * offline funcionam) e as tentativas de pagamento online recebem um erro claro
 * em vez de derrubar o contexto Spring no arranque.</p>
 *
 * <p><strong>Valor da cobrança</strong>: {@link PaymentGateway#charge} recebe o
 * total do pedido — sem isto, a interface não permitia cobrar o valor certo quando
 * existisse um gateway real (o total é recalculado no servidor, nunca vem do
 * cliente). Moçambique usa Metical (MZN) — a moeda é fixa aqui e não vem do pedido.</p>
 */
@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    /** Moeda da loja (os gateways móveis moçambicanos cobram em MZN). */
    public static final String CURRENCY = "MZN";

    /** Registo dos métodos aceites — id, rótulo e aliases aceites no payload. */
    private static final List<PaymentMethodInfo> METHODS = List.of(
            new PaymentMethodInfo("cod", "Pagamento na entrega",
                    List.of("Cash on delivery", "CASH_ON_DELIVERY", "cod"), false, false, false),
            new PaymentMethodInfo("transfer", "Transferência bancária",
                    List.of("Bank transfer", "Transfer", "BANK_TRANSFER"), false, false, false),
            new PaymentMethodInfo("mpesa", "M-Pesa",
                    List.of("MPESA"), true, true, false),
            new PaymentMethodInfo("emola", "e-Mola",
                    List.of("EMOLA"), true, true, false),
            new PaymentMethodInfo("card", "Cartão Visa / Mastercard",
                    List.of("Card", "Credit card", "CARD"), true, false, true));

    private final ObjectProvider<PaymentGateway> gatewayProvider;
    /** Bulkhead: teto de cobranças simultâneas ao gateway. */
    private final Semaphore chargeSlots;
    /** Tempo máximo de espera por uma vaga antes de responder 503. */
    private final Duration chargeSlotTimeout;

    public PaymentService(
            ObjectProvider<PaymentGateway> gatewayProvider,
            @Value("${app.payments.max-concurrent-charges:8}") int maxConcurrentCharges,
            @Value("${app.payments.charge-slot-timeout-seconds:10}") int chargeSlotTimeoutSeconds) {
        this.gatewayProvider = gatewayProvider;
        this.chargeSlots = new Semaphore(Math.max(1, maxConcurrentCharges), true);
        this.chargeSlotTimeout = Duration.ofSeconds(Math.max(1, chargeSlotTimeoutSeconds));
    }

    /**
     * Resolve o método pelo rótulo (ou alias, ex.: nome do enum) — case-insensitive.
     * Vazio se o método não existir (o pedido é rejeitado com 400).
     */
    public Optional<PaymentMethodInfo> resolve(String label) {
        if (label == null) {
            return Optional.empty();
        }
        String trimmed = label.trim();
        return METHODS.stream()
                .filter(m -> m.label().equalsIgnoreCase(trimmed)
                        || m.aliases().stream().anyMatch(a -> a.equalsIgnoreCase(trimmed)))
                .findFirst();
    }

    /** Lista de métodos aceites (rótulos) — para whitelist e documentação. */
    public List<String> availableLabels() {
        return METHODS.stream().map(PaymentMethodInfo::label).toList();
    }

    /**
     * Métodos disponíveis AGORA (rótulos): os pagos online só aparecem quando há
     * um gateway configurado. O frontend consulta isto para desativar no checkout
     * os métodos que devolveriam 503 — sem isto, o cliente escolhia M-Pesa e só
     * descobria a indisponibilidade no fim, com o pedido a falhar.
     */
    public List<String> currentlyAvailableLabels() {
        boolean gatewayPresent = gatewayProvider.getIfAvailable() != null;
        return METHODS.stream()
                .filter(m -> !m.paidOnline() || gatewayPresent)
                .map(PaymentMethodInfo::label)
                .toList();
    }

    /** true se o método pago online pode ser cobrado (gateway presente). */
    public boolean onlinePaymentsAvailable() {
        return gatewayProvider.getIfAvailable() != null;
    }

    /**
     * Valida os dados de pagamento e, para métodos pagos online, cobra no
     * gateway. Devolve a referência da cobrança (null para pagamento na
     * entrega / transferência). Lança 400 se faltarem dados obrigatórios.
     */
    public String authorize(PaymentMethodInfo method, OrderRequest.PaymentInfoRequest info, BigDecimal total) {
        if (!method.paidOnline()) {
            return null;
        }
        if (total == null || total.signum() < 0) {
            throw ApiException.badRequest("Valor de cobrança inválido");
        }
        String phone = info == null ? null : normalizePhone(info.phone());
        String cardLast4 = info == null ? null : normalizeCardLast4(info.cardLast4());

        if (method.needsPhone()) {
            if (phone == null) {
                throw ApiException.badRequest("Indique o número de telemóvel para pagar com " + method.label());
            }
            // Telemóvel moçambicano: 9 dígitos (8…) ou com prefixo +258.
            if (!(phone.length() == 9 && phone.startsWith("8") || phone.length() == 12 && phone.startsWith("258"))) {
                throw ApiException.badRequest("Número de telemóvel inválido para " + method.label()
                        + " (use +258 8X XXX XXXX)");
            }
        }
        if (method.needsCard()) {
            if (cardLast4 == null) {
                throw ApiException.badRequest("Indique os dados do cartão para concluir o pagamento");
            }
            // Últimos 4 dígitos do cartão (o frontend envia apenas estes — o resto
            // do número nunca chega ao servidor).
            if (cardLast4.length() != 4 || cardLast4.chars().anyMatch(c -> !Character.isDigit(c))) {
                throw ApiException.badRequest("Dados do cartão inválidos");
            }
        }
        PaymentGateway gateway = gatewayProvider.getIfAvailable();
        if (gateway == null) {
            throw ApiException.serviceUnavailable(
                    "Pagamentos online temporariamente indisponíveis — gateway não configurado."
                            + " Escolha pagamento na entrega ou transferência bancária.");
        }
        // Bulkhead: cada cobrança ocupa uma thread do Tomcat durante a latência do
        // gateway (num gateway real é uma chamada HTTP). Sem limite, um gateway
        // lento esgotava as 200 threads do Tomcat e derrubava a API INTEIRA — não
        // só o checkout. Acima do limite responde-se 503 depressa, em vez de
        // acumular threads à espera. Uma vaga é sempre devolvida no finally.
        boolean acquired;
        try {
            acquired = chargeSlots.tryAcquire(chargeSlotTimeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw ApiException.serviceUnavailable("Pagamento interrompido — tente novamente.");
        }
        if (!acquired) {
            throw ApiException.serviceUnavailable(
                    "Demasiados pagamentos em curso neste momento. Tente novamente dentro de instantes.");
        }
        try {
            return gateway.charge(method.id(), phone, cardLast4, total, CURRENCY);
        } finally {
            chargeSlots.release();
        }
    }

    /**
     * Estorna uma cobrança (compensação).
     *
     * <p>Chamado quando o pedido falha depois da cobrança (ex.: falha ao gravar,
     * rollback no commit). É <strong>best-effort e nunca lança</strong>: corre no
     * caminho de erro, onde a exceção original é a que interessa.</p>
     */
    public void refund(String reference) {
        if (reference == null || reference.isBlank()) {
            return;
        }
        try {
            PaymentGateway gateway = gatewayProvider.getIfAvailable();
            if (gateway == null) {
                log.warn("Sem gateway de pagamento para estornar a referência {}", reference);
                return;
            }
            gateway.refund(reference);
        } catch (Exception e) {
            log.error("Falha ao estornar a referência {} — verifique manualmente no gateway",
                    reference, e);
        }
    }

    /** Normaliza o número: remove espaços, hífenes, parênteses e o + inicial. */
    private static String normalizePhone(String phone) {
        if (phone == null || phone.isBlank()) {
            return null;
        }
        return phone.replaceAll("[^0-9]", "");
    }

    private static String normalizeCardLast4(String cardLast4) {
        if (cardLast4 == null || cardLast4.isBlank()) {
            return null;
        }
        return cardLast4.replaceAll("[^0-9]", "");
    }

    /** Metadados de um método de pagamento. */
    public record PaymentMethodInfo(
            String id,
            String label,
            List<String> aliases,
            /** Pago online no checkout → pedido começa em "Pagamento confirmado". */
            boolean paidOnline,
            /** Exige número de telemóvel (carteiras móveis). */
            boolean needsPhone,
            /** Exige dados de cartão. */
            boolean needsCard) {}
}
