package mz.norteshopmoz.api.service;

import java.util.List;
import java.util.Optional;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.web.dto.OrderRequest;
import org.springframework.beans.factory.ObjectProvider;
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
 */
@Service
public class PaymentService {

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

    public PaymentService(ObjectProvider<PaymentGateway> gatewayProvider) {
        this.gatewayProvider = gatewayProvider;
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
     * Valida os dados de pagamento e, para métodos pagos online, cobra no
     * gateway. Devolve a referência da cobrança (null para pagamento na
     * entrega / transferência). Lança 400 se faltarem dados obrigatórios.
     */
    public String authorize(PaymentMethodInfo method, OrderRequest.PaymentInfoRequest info) {
        if (!method.paidOnline()) {
            return null;
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
        return gateway.charge(method.id(), phone, cardLast4);
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
