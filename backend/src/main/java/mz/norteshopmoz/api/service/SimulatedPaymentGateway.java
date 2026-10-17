package mz.norteshopmoz.api.service;

import java.math.BigDecimal;
import java.security.SecureRandom;
import mz.norteshopmoz.api.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Gateway de pagamento SIMULADO — usado por omissão (dev/demo).
 *
 * <p>Imita o fluxo de <strong>checkout hospedado</strong> da PaySuite para o
 * ambiente de demonstração ser idêntico ao de produção: o cliente escolhe o
 * método no checkout, clica em «Comprar» e recebe um <strong>link de
 * pagamento</strong> — a página {@code /pagamento-simulado} da própria loja,
 * que simula o provedor (confirmar/falhar). O pedido nasce em {@code Aguarda
 * pagamento} e só avança quando a página demo confirma (via
 * {@code PaymentSimulatedController}, disponível só fora de {@code prod}).
 * Antes a cobrança era síncrona ("confirma logo"): o dev testava um fluxo que
 * a produção nunca teria.</p>
 *
 * <p><strong>Nunca é registado no perfil {@code prod}</strong>: um deploy com
 * {@code PAYMENTS_MODE=simulated} (o valor por omissão) não pode confirmar
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

    /** Alfabeto do id de pagamento (sem caracteres ambíguos). */
    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    /** Base da loja — é onde vive a página de pagamento simulada. */
    private final String storeBaseUrl;

    public SimulatedPaymentGateway(AppProperties props) {
        String base = props == null || props.mail() == null || props.mail().baseUrl() == null
                ? "" : props.mail().baseUrl().replaceAll("/+$", "");
        this.storeBaseUrl = base;
    }

    /**
     * Cria um pagamento <strong>pendente</strong> com um link para a página
     * simulada — mesmo contrato do checkout hospedado real (referência do
     * provedor + {@code checkout_url}). Sem telefone/cartão: quem os recolheria
     * seria a página do provedor, e a simulada não precisa.
     */
    @Override
    public PaymentCharge charge(String reference, String methodId, String phone, String cardLast4,
                                BigDecimal amount, String currency, String description) {
        // Sem valor não há simulação que valha — o chamador valida antes, mas é a
        // última linha de defesa contra uma cobrança "sem valor".
        if (amount == null || amount.signum() < 0) {
            throw new IllegalArgumentException("Valor de cobrança inválido: " + amount);
        }
        String paymentId = "SIM-" + randomCode(10);
        String checkoutUrl = storeBaseUrl + "/pagamento-simulado"
                + "?ref=" + paymentId
                + "&order=" + reference
                + "&method=" + methodId
                + "&amount=" + amount.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
        log.info("[PAGAMENTO SIMULADO] Criado pagamento {} (método {}, {} {}) — link de pagamento: {}",
                paymentId, methodId, amount, currency, checkoutUrl);
        return PaymentCharge.redirect(paymentId, checkoutUrl);
    }

    /** No modo simulado não há dinheiro a devolver: apenas se regista o estorno. */
    @Override
    public void refund(String reference, BigDecimal amount) {
        log.info("[PAGAMENTO SIMULADO] Estorno registado para a referência {} ({})", reference, amount);
    }

    /** A página de pagamento é própria (como a PaySuite) — o checkout não recolhe dados. */
    @Override
    public boolean hostedCheckout() {
        return true;
    }

    private static String randomCode(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(CODE_ALPHABET[RANDOM.nextInt(CODE_ALPHABET.length)]);
        }
        return sb.toString();
    }
}
