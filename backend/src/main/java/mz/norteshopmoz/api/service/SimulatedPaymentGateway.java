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
 * <p>Cria a <strong>referência de cobrança</strong> e deixa o pedido em
 * {@code Aguarda pagamento} — sem página de pagamento própria.
 *
 * <p>Existiu uma página {@code /pagamento-simulado} que imitava o provedor e
 * confirmava o pedido sem dinheiro nenhum; foi removida. O link que o cliente
 * abre é sempre o do provedor (PaySuite) ou o que o admin cola no pedido — em
 * dev, o pedido fica a aguardar esse link, exatamente como em produção quando
 * o gateway não devolve um. Quem confirma um pagamento é o webhook assinado,
 * nunca a loja.</p>
 *
 * <p><strong>Nunca é registado no perfil {@code prod}</strong>: um deploy com
 * {@code PAYMENTS_MODE=simulated} (o valor por omissão) não pode confirmar
 * pagamentos online sem cobrar nada — prejuízo direto. Em produção, os métodos
 * pagos online respondem 503 ("gateway não configurado") até existir uma
 * integração real.</p>
 */
@Component
@Profile("!prod")
@ConditionalOnProperty(name = "app.payments.mode", havingValue = "simulated", matchIfMissing = true)
public class SimulatedPaymentGateway implements PaymentGateway {

    private static final Logger log = LoggerFactory.getLogger(SimulatedPaymentGateway.class);

    private static final SecureRandom RANDOM = new SecureRandom();

    /** Alfabeto do id de pagamento (sem caracteres ambíguos). */
    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    public SimulatedPaymentGateway(AppProperties props) {
        // Sem estado: já não existe página de pagamento própria (o link vem do
        // provedor, ou é o admin que o cola no pedido). O parâmetro mantém-se
        // para o bean continuar igual ao dos gateways reais.
    }

    /**
     * Cria a cobrança <strong>pendente</strong> — referência do provedor, sem
     * {@code checkout_url}. O link que o cliente abre vem da PaySuite ou do
     * admin (campo do pedido no painel); este gateway não tem página própria.
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
        // Sem página de pagamento própria: o link que o cliente abre é o do
        // provedor (PaySuite) ou o que o admin cola no painel. Antes gerava-se
        // aqui um link interno (/pagamento-simulado) que parecia um pagamento a
        // sério e confirmava pedidos sem dinheiro nenhum — foi removido.
        log.info("[PAGAMENTO SIMULADO] Cobrança {} criada (método {}, {} {}) SEM link de pagamento "
                        + "— o pedido {} fica a aguardar o link enviado pelo admin.",
                paymentId, methodId, amount, currency, reference);
        return new PaymentCharge(paymentId, null);
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
