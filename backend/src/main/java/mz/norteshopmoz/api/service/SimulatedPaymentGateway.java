package mz.norteshopmoz.api.service;

import java.math.BigDecimal;
import java.security.SecureRandom;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Gateway de pagamento SIMULADO — usado por omissão (dev/demo).
 *
 * <p>Não cobra nada: apenas valida o mínimo e devolve uma referência com
 * formato realista ({@code MP-<código>}, {@code EM-<código>},
 * {@code CARD-<código>·••••<últimos 4>}) para o pedido ficar completo.
 * Substituir por uma implementação real com {@code app.payments.mode=live}.</p>
 *
 * <p><strong>Nunca é registado no perfil {@code prod}</strong>: antes, um
 * deploy com {@code PAYMENTS_MODE=simulated} (o valor por omissão) confirmava
 * pagamentos online sem cobrar nada — prejuízo direto. Em produção, os métodos
 * pagos online respondem 503 ("gateway não configurado") até existir uma
 * integração real; os métodos offline (entrega/transferência) continuam a
 * funcionar.</p>
 */
@Component
@Profile("!prod")
@ConditionalOnProperty(name = "app.payments.mode", havingValue = "simulated", matchIfMissing = true)
public class SimulatedPaymentGateway implements PaymentGateway {

    private static final Logger log = LoggerFactory.getLogger(SimulatedPaymentGateway.class);

    private static final SecureRandom RANDOM = new SecureRandom();

    /** Alfabeto da referência (sem caracteres ambíguos). */
    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    @Override
    public String charge(String methodId, String phone, String cardLast4, BigDecimal amount, String currency) {
        // Sem valor não há simulação que valha — o chamador valida antes, mas é a
        // última linha de defesa contra uma cobrança "sem valor".
        if (amount == null || amount.signum() < 0) {
            throw new IllegalArgumentException("Valor de cobrança inválido: " + amount);
        }
        String prefix = switch (methodId) {
            case "mpesa" -> "MP";
            case "emola" -> "EM";
            case "card" -> "CARD";
            default -> "PAY";
        };
        String code = randomCode(10);
        if (cardLast4 != null && !cardLast4.isBlank()) {
            return prefix + "-" + code + "\u00b7\u2022\u2022\u2022\u2022" + cardLast4;
        }
        return prefix + "-" + code;
    }

    /** No modo simulado não há dinheiro a devolver: apenas se regista o estorno. */
    @Override
    public void refund(String reference) {
        log.info("[PAGAMENTO SIMULADO] Estorno registado para a referência {}", reference);
    }

    private static String randomCode(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(CODE_ALPHABET[RANDOM.nextInt(CODE_ALPHABET.length)]);
        }
        return sb.toString();
    }
}
