package mz.norteshopmoz.api.service;

import java.math.BigDecimal;

/**
 * Gateway de pagamento — contrato para os métodos pagos online (M-Pesa, e-Mola,
 * cartão).
 *
 * <p><strong>Breaking change intencional</strong>: {@code charge} recebe o valor
 * e a moeda. Antes, a interface não permitia cobrar o total do pedido — qualquer
 * implementação real teria de adivinhar o valor, o que é inadmissível num
 * gateway: é o servidor que recalcula o total (o do cliente é informativo) e
 * esse é o valor a cobrar, em MZN (Metical).</p>
 */
public interface PaymentGateway {

    /**
     * Cobra o valor indicado no método escolhido.
     *
     * @param methodId   id do método ("mpesa", "emola", "card", …)
     * @param phone      telefone da carteira móvel (null em cartões)
     * @param cardLast4  últimos 4 dígitos do cartão (null em carteiras)
     * @param amount     valor a cobrar (recalculado no servidor, nunca no cliente)
     * @param currency   moeda ISO (ex.: "MZN")
     * @return referência da cobrança (guardada no pedido, usada em estornos)
     */
    String charge(String methodId, String phone, String cardLast4, BigDecimal amount, String currency);

    /**
     * Estorna uma cobrança anterior (compensação quando o pedido falha após a
     * cobrança).
     *
     * @param reference referência devolvida por {@link #charge}
     */
    void refund(String reference);
}
