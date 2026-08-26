package mz.norteshopmoz.api.service;

import java.security.SecureRandom;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Gateway de pagamento SIMULADO — usado por omissão (dev/demo).
 *
 * <p>Não cobra nada: apenas valida o mínimo e devolve uma referência com
 * formato realista ({@code MP-<código>}, {@code EM-<código>},
 * {@code CARD-<código>·••••<últimos 4>}) para o pedido ficar completo.
 * Substituir por uma implementação real com {@code app.payments.mode=live}.</p>
 */
@Component
@ConditionalOnProperty(name = "app.payments.mode", havingValue = "simulated", matchIfMissing = true)
public class SimulatedPaymentGateway implements PaymentGateway {

    private static final SecureRandom RANDOM = new SecureRandom();

    /** Alfabeto da referência (sem caracteres ambíguos). */
    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    @Override
    public String charge(String methodId, String phone, String cardLast4) {
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

    private static String randomCode(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(CODE_ALPHABET[RANDOM.nextInt(CODE_ALPHABET.length)]);
        }
        return sb.toString();
    }
}
