package mz.norteshopmoz.api.service;

import java.math.BigDecimal;

/**
 * Gateway de pagamento — contrato para os métodos pagos online (M-Pesa, e-Mola,
 * cartão).
 *
 * <p>O contrato cobre os <strong>dois modelos</strong> de gateway usados no
 * mercado moçambicano:</p>
 *
 * <ul>
 *   <li><b>Cobrança síncrona</b> — a resposta confirma logo o pagamento. Nenhum
 *       gateway a usa hoje: dinheiro só entra quando o provedor o confirma por
 *       webhook assinado, nunca pela resposta de criação.</li>
 *   <li><b>Checkout hospedado</b> — a resposta cria um pedido de pagamento
 *       <em>pendente</em> e devolve um URL onde o cliente paga; a confirmação
 *       chega depois por webhook ({@link PaymentWebhookService}). É o caso da
 *       PaySuite ({@link PaySuitePaymentGateway}). O pedido nasce em
 *       {@code Aguarda pagamento} e só avança quando a notificação assinada
 *       chega — a loja nunca marca como pago algo que ainda não o está.</li>
 * </ul>
 *
 * <p><strong>Valor</strong>: o servidor recalcula o total do pedido e é esse o
 * valor passado a {@link #charge} (o total enviado pelo cliente é informativo).
 * A moeda da loja é fixa em MZN (Metical).</p>
 */
public interface PaymentGateway {

    /**
     * Inicia a cobrança.
     *
     * @param reference   referência única do pedido (o id do pedido — usado pelo
     *                    provedor em relatórios e nos webhooks; máx. 50 chars)
     * @param methodId    id do método ("mpesa", "emola", "card", …)
     * @param phone       telefone da carteira móvel (pode ser null; gateways de
     *                    checkout hospedado recolhem-no na página deles)
     * @param cardLast4   últimos 4 dígitos do cartão (pode ser null)
     * @param amount      valor a cobrar (recalculado no servidor, nunca no cliente)
     * @param currency    moeda ISO (ex.: "MZN")
     * @param description descrição legível do pedido (aparece no extrato/página do provedor)
     * @return o resultado da cobrança — referência do provedor e, nos gateways com
     *         checkout hospedado, o URL para onde redirecionar o cliente
     */
    PaymentCharge charge(String reference, String methodId, String phone, String cardLast4,
                         BigDecimal amount, String currency, String description);

    /**
     * Estorna uma cobrança anterior (compensação quando o pedido falha após a
     * criação do pagamento).
     *
     * <p>É <strong>best-effort</strong>: um gateway pode recusar o estorno de um
     * pagamento ainda pendente, e isso não pode fazer falhar o caminho de erro
     * original. Quem chama trata e registra a falha (ver
     * {@code PaymentService.refund}).</p>
     *
     * @param reference referência devolvida por {@link #charge} (id no provedor)
     * @param amount    valor a devolver (o total cobrado)
     */
    void refund(String reference, BigDecimal amount);

    /**
     * O gateway usa uma página de pagamento própria (checkout hospedado)?
     *
     * <p>Nesse caso <strong>não</strong> é a loja que recolhe telefone/cartão — é
     * o provedor, na página dele. {@code PaymentService} usa isto para não exigir
     * dados que o cliente vai preencher noutro sítio (pedir o número completo do
     * cartão no nosso checkout seria, além de redundante, uma responsabilidade de
     * PCI desnecessária).</p>
     */
    default boolean hostedCheckout() {
        return false;
    }

    /**
     * Resultado de {@link #charge}.
     *
     * @param reference   referência do pagamento <strong>no provedor</strong>
     *                    (guardada no pedido e usada em estornos e webhooks)
     * @param checkoutUrl URL da página de pagamento do provedor, ou {@code null}
     *                    quando a cobrança foi confirmada de forma síncrona
     */
    record PaymentCharge(String reference, String checkoutUrl) {

        /** Verdadeiro quando o cliente tem de ser redirecionado para pagar. */
        public boolean redirectRequired() {
            return checkoutUrl != null && !checkoutUrl.isBlank();
        }

        /** Cobrança confirmada na resposta (gateway síncrono). */
        public static PaymentCharge confirmed(String reference) {
            return new PaymentCharge(reference, null);
        }

        /** Pagamento criado mas ainda pendente — o cliente paga no URL. */
        public static PaymentCharge redirect(String reference, String checkoutUrl) {
            return new PaymentCharge(reference, checkoutUrl);
        }
    }
}
