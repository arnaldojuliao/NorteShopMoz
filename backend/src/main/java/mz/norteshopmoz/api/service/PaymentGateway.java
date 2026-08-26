package mz.norteshopmoz.api.service;

/**
 * Contrato de cobrança de pagamentos online (M-Pesa, e-Mola, cartão).
 *
 * <p>Ponto único de extensão para integrar um gateway real: implementar esta
 * interface (ex.: API M-Pesa da Vodacom, e-Mola API da Movitel, um processador
 * de cartões) e selecioná-la com {@code app.payments.mode=live}. Em modo
 * {@code simulated} (padrão) a implementação {@link SimulatedPaymentGateway}
 * devolve uma referência sem cobrar nada — o fluxo de compra funciona de ponta
 * a ponta para testes/demo.</p>
 */
public interface PaymentGateway {

    /**
     * Cobra o pagamento e devolve uma referência única a guardar no pedido
     * (ex.: {@code MP-4F3K9Q2X7Z} ou {@code CARD-••••1234}).
     *
     * @param methodId   id do método: {@code mpesa}, {@code emola} ou {@code card}
     * @param phone      número de telemóvel (M-Pesa/e-Mola) — null para cartão
     * @param cardLast4  últimos 4 dígitos do cartão — null para carteiras móveis
     * @return referência da cobrança
     */
    String charge(String methodId, String phone, String cardLast4);
}
