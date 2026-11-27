package mz.norteshopmoz.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.Optional;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import mz.norteshopmoz.api.config.AppProperties;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.PaymentIncident;
import mz.norteshopmoz.api.domain.OrderStatus;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.OrderRepository;
import org.junit.jupiter.api.Test;

/**
 * Confirmações assíncronas da PaySuite: assinatura, idempotência e recusas.
 *
 * <p>O endpoint é público, por isso os casos que interessam são os de ataque e os
 * de repetição: sem assinatura válida nada é confirmado, sem segredo configurado
 * nada é aceite, e uma notificação repetida não altera nada nem volta a gravar.</p>
 */
class PaymentWebhookServiceTest {

    private static final String SECRET = "segredo-partilhado-do-gateway";
    private static final String PAYMENT_ID = "01H8X9V8X9Y8Z9A8B8C8D8E8F8";

    private final OrderRepository orderRepository = mock(OrderRepository.class);
    private final PaymentIncidentService incidentService = mock(PaymentIncidentService.class);

    private PaymentWebhookService service(String secret) {
        AppProperties props = new AppProperties(null, null, null, null, null,
                new AppProperties.Payments("live", "https://paysuite.tech/api/v1", "k", secret,
                        "https://loja.mz/api/payments/webhook", "https://loja.mz/pedidos", 5_000),
                null, null);
        return new PaymentWebhookService(orderRepository, incidentService, props);
    }

    private static Order order(String id, String paymentId, OrderStatus status) {
        return order(id, paymentId, status, null);
    }

    private static Order order(String id, String paymentId, OrderStatus status,
            java.math.BigDecimal total) {
        return Order.builder()
                .id(id)
                .paymentReference(paymentId)
                .status(status)
                .total(total)
                .build();
    }

    private static String sign(String secret, String body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
    }

    /** Corpo como a PaySuite o envia: evento + data (id do pagamento + id do pedido). */
    private static String body(String event, String orderReference) {
        return "{\"event\":\"" + event + "\",\"data\":{\"id\":\"" + PAYMENT_ID
                + "\",\"amount\":100.50,\"reference\":\"" + orderReference + "\"}}";
    }

    @Test
    void handle_paymentSuccess_confirmaOPagamentoPendente() throws Exception {
        String payload = body("payment.success", "NSM-1");
        Order order = order("NSM-1", PAYMENT_ID, OrderStatus.AGUARDA_PAGAMENTO);
        when(orderRepository.findByPaymentReference(PAYMENT_ID)).thenReturn(Optional.of(order));

        String orderId = service(SECRET).handle(payload, sign(SECRET, payload));

        assertThat(orderId).isEqualTo("NSM-1");
        assertThat(order.getStatus()).isEqualTo(OrderStatus.PAGAMENTO_CONFIRMADO);
        verify(orderRepository).save(order);
    }

    @Test
    void handle_aceitaOPrefixoSha256NaAssinatura() throws Exception {
        // A PaySuite envia apenas o hex; o prefixo é aceite por compatibilidade com
        // gateways que o usam (e com a documentação histórica do projeto).
        String payload = body("payment.success", "NSM-1");
        Order order = order("NSM-1", PAYMENT_ID, OrderStatus.AGUARDA_PAGAMENTO);
        when(orderRepository.findByPaymentReference(PAYMENT_ID)).thenReturn(Optional.of(order));

        service(SECRET).handle(payload, "sha256=" + sign(SECRET, payload));

        assertThat(order.getStatus()).isEqualTo(OrderStatus.PAGAMENTO_CONFIRMADO);
    }

    @Test
    void handle_semPagamentoGuardado_encontraOPedidoPelaReferencia() throws Exception {
        // Se a gravação do pedido falhou (ou a referência interna mudou), o id do
        // pedido que enviamos ao provedor ainda permite ligar o pagamento ao pedido.
        String payload = body("payment.success", "NSM-1");
        Order order = order("NSM-1", null, OrderStatus.AGUARDA_PAGAMENTO);
        when(orderRepository.findByPaymentReference(PAYMENT_ID)).thenReturn(Optional.empty());
        when(orderRepository.findById("NSM-1")).thenReturn(Optional.of(order));

        String orderId = service(SECRET).handle(payload, sign(SECRET, payload));

        assertThat(orderId).isEqualTo("NSM-1");
        assertThat(order.getStatus()).isEqualTo(OrderStatus.PAGAMENTO_CONFIRMADO);
    }

    @Test
    void handle_montanteDivergente_naoConfirmaNemGrava() throws Exception {
        String payload = body("payment.success", "NSM-1");
        Order order = order("NSM-1", PAYMENT_ID, OrderStatus.AGUARDA_PAGAMENTO,
                new java.math.BigDecimal("90.00"));
        when(orderRepository.findByPaymentReference(PAYMENT_ID)).thenReturn(Optional.of(order));

        String orderId = service(SECRET).handle(payload, sign(SECRET, payload));

        assertThat(orderId).isEqualTo("NSM-1");
        assertThat(order.getStatus()).isEqualTo(OrderStatus.AGUARDA_PAGAMENTO);
        verify(orderRepository, never()).save(any());
        verify(incidentService).record(eq("NSM-1"), eq(PAYMENT_ID), eq(PaymentIncident.TYPE_WEBHOOK_FAILED), any());
    }

    @Test
    void handle_moedaDiferente_naoConfirma() throws Exception {
        String payload = "{\"event\":\"payment.success\",\"data\":{\"id\":\"" + PAYMENT_ID
                + "\",\"amount\":100.50,\"currency\":\"USD\",\"reference\":\"NSM-1\"}}";
        Order order = order("NSM-1", PAYMENT_ID, OrderStatus.AGUARDA_PAGAMENTO,
                new java.math.BigDecimal("100.50"));
        when(orderRepository.findByPaymentReference(PAYMENT_ID)).thenReturn(Optional.of(order));

        service(SECRET).handle(payload, sign(SECRET, payload));

        assertThat(order.getStatus()).isEqualTo(OrderStatus.AGUARDA_PAGAMENTO);
        verify(orderRepository, never()).save(any());
        verify(incidentService).record(eq("NSM-1"), eq(PAYMENT_ID), eq(PaymentIncident.TYPE_WEBHOOK_FAILED), any());
    }

    @Test
    void handle_pagamentoAposCancelamento_naoReabreEPedeEstorno() throws Exception {
        String payload = body("payment.success", "NSM-1");
        Order order = order("NSM-1", PAYMENT_ID, OrderStatus.CANCELADO,
                new java.math.BigDecimal("100.50"));
        when(orderRepository.findByPaymentReference(PAYMENT_ID)).thenReturn(Optional.of(order));

        service(SECRET).handle(payload, sign(SECRET, payload));

        assertThat(order.getStatus()).isEqualTo(OrderStatus.CANCELADO);
        verify(orderRepository, never()).save(any());
        verify(incidentService).record(eq("NSM-1"), eq(PAYMENT_ID), eq(PaymentIncident.TYPE_REFUND_FAILED), any());
    }

    @Test
    void handle_assinaturaInvalida_naoConfirmaNada() throws Exception {
        String payload = body("payment.success", "NSM-1");
        when(orderRepository.findByPaymentReference(PAYMENT_ID))
                .thenReturn(Optional.of(order("NSM-1", PAYMENT_ID, OrderStatus.AGUARDA_PAGAMENTO)));

        assertThatThrownBy(() -> service(SECRET).handle(payload, "deadbeef"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Assinatura inválida");
        verify(orderRepository, never()).save(any());
    }

    @Test
    void handle_semAssinatura_naoConfirmaNada() {
        assertThatThrownBy(() -> service(SECRET).handle(body("payment.success", "NSM-1"), null))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Assinatura inválida");
        verify(orderRepository, never()).save(any());
    }

    @Test
    void handle_semSegredoConfigurado_devolve503() {
        String payload = body("payment.success", "NSM-1");

        // Nunca aceitar notificações sem segredo configurado: sem isso qualquer
        // pessoa que descobrisse o URL podia confirmar pagamentos inventados.
        // (A assinatura nem chega a ser avaliada — o endpoint recusa primeiro.)
        assertThatThrownBy(() -> service("").handle(payload, "qualquer-assinatura"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("não configurado");
    }

    @Test
    void handle_repetida_eIdempotente() throws Exception {
        String payload = body("payment.success", "NSM-1");
        Order order = order("NSM-1", PAYMENT_ID, OrderStatus.PAGAMENTO_CONFIRMADO);
        when(orderRepository.findByPaymentReference(PAYMENT_ID)).thenReturn(Optional.of(order));

        String orderId = service(SECRET).handle(payload, sign(SECRET, payload));

        assertThat(orderId).isEqualTo("NSM-1");
        verify(orderRepository, never()).save(any());
    }

    @Test
    void handle_referenciaDesconhecida_devolve404() throws Exception {
        String payload = body("payment.success", "NSM-NAO-EXISTE");
        when(orderRepository.findByPaymentReference(PAYMENT_ID)).thenReturn(Optional.empty());
        when(orderRepository.findById("NSM-NAO-EXISTE")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service(SECRET).handle(payload, sign(SECRET, payload)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("desconhecida");
    }

    @Test
    void handle_paymentFailed_naoConfirmaNemCancelaAutomaticamente() throws Exception {
        String payload = body("payment.failed", "NSM-1");
        Order order = order("NSM-1", PAYMENT_ID, OrderStatus.AGUARDA_PAGAMENTO);
        when(orderRepository.findByPaymentReference(PAYMENT_ID)).thenReturn(Optional.of(order));

        String orderId = service(SECRET).handle(payload, sign(SECRET, payload));

        assertThat(orderId).isEqualTo("NSM-1");
        // O pedido fica como está: quem decide cancelar é a operação, olhando para
        // o painel do provedor (pode ser uma tentativa falhada e o cliente repetir).
        assertThat(order.getStatus()).isEqualTo(OrderStatus.AGUARDA_PAGAMENTO);
        verify(orderRepository, never()).save(any());
    }

    @Test
    void handle_corpoInvalido_devolve400() throws Exception {
        String payload = "não é json";
        assertThatThrownBy(() -> service(SECRET).handle(payload, sign(SECRET, payload)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("inválida");
    }
}
