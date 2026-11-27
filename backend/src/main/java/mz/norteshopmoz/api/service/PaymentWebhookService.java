package mz.norteshopmoz.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Optional;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import mz.norteshopmoz.api.config.AppProperties;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.OrderStatus;
import mz.norteshopmoz.api.domain.PaymentIncident;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.OrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Confirmações assíncronas do gateway de pagamento (webhooks da PaySuite).
 *
 * <p>A PaySuite cria o pagamento em estado {@code pending} e confirma-o por
 * notificação: {@code payment.success} quando o cliente paga e
 * {@code payment.failed} quando não. Este serviço é o lado que a recebe e faz o
 * pedido avançar de {@code Aguarda pagamento} para {@code Pagamento confirmado}.</p>
 *
 * <h2>Porque é que a assinatura não é opcional</h2>
 *
 * <p>O endpoint é público (o gateway não tem sessão na loja), portanto qualquer
 * pessoa que descubra o URL pode enviar-lhe um corpo. Sem verificação de
 * assinatura, isso significaria confirmar pagamentos que nunca aconteceram — ou
 * seja, entregar mercadoria de graça. A notificação só é aceite com um
 * HMAC-SHA256 do <strong>corpo cru</strong> calculado com
 * {@code app.payments.webhook-secret}, no cabeçalho {@code X-Signature}
 * (formato hex da PaySuite; por compatibilidade aceita-se também
 * {@code sha256=<hex>} e o cabeçalho antigo {@code X-NSM-Signature}). Sem segredo
 * configurado o endpoint responde 503 em vez de aceitar notificações não
 * assinadas.</p>
 *
 * <h2>Idempotência</h2>
 *
 * <p>A PaySuite repete notificações até 5 vezes com backoff exponencial, pelo
 * que confirmar duas vezes tem de ser inofensivo: um pedido já em
 * {@code Pagamento confirmado} (ou num estado posterior) não é tocado —
 * devolve-se o mesmo resultado.</p>
 */
@Service
public class PaymentWebhookService {

    private static final Logger log = LoggerFactory.getLogger(PaymentWebhookService.class);

    /** Eventos da PaySuite. */
    private static final String EVENT_PAYMENT_SUCCESS = "payment.success";
    private static final String EVENT_PAYMENT_FAILED = "payment.failed";

    private final OrderRepository orderRepository;
    private final PaymentIncidentService incidentService;
    private final String webhookSecret;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public PaymentWebhookService(OrderRepository orderRepository,
            PaymentIncidentService incidentService, AppProperties props) {
        this.orderRepository = orderRepository;
        this.incidentService = incidentService;
        AppProperties.Payments cfg = props.payments();
        this.webhookSecret = cfg == null || cfg.webhookSecret() == null
                ? "" : cfg.webhookSecret().trim();
    }

    /**
     * Processa uma notificação do gateway.
     *
     * @param rawBody   corpo cru (exatamente os bytes assinados — não o JSON reserializado)
     * @param signature valor do cabeçalho {@code X-Signature} ({@code <hex>} ou {@code sha256=<hex>})
     * @return o id do pedido afetado
     * @throws ApiException 503 sem segredo configurado, 401 com assinatura inválida,
     *                      400 com notificação inválida, 404 com referência desconhecida
     */
    @Transactional
    public String handle(String rawBody, String signature) {
        if (webhookSecret.isBlank()) {
            throw ApiException.serviceUnavailable(
                    "Webhook de pagamento não configurado nesta loja.");
        }
        if (!signatureMatches(rawBody, signature)) {
            log.warn("Notificação de pagamento recusada: assinatura inválida ou ausente");
            throw ApiException.unauthorized("Assinatura inválida.");
        }

        JsonNode payload = parse(rawBody);
        JsonNode data = payload == null ? null : payload.get("data");
        String event = text(payload, "event");
        // O identificador do pagamento na PaySuite (ULID) é o que ficou guardado no
        // pedido como paymentReference; a `reference` é o id do pedido que enviamos.
        String paymentId = text(data, "id");
        String reference = text(data, "reference");
        if (event == null || paymentId == null) {
            throw ApiException.badRequest("Notificação de pagamento inválida: faltam campos.");
        }

        Order order = orderRepository.findByPaymentReference(paymentId)
                .or(() -> reference == null ? Optional.empty() : orderRepository.findById(reference))
                .orElseThrow(() -> ApiException.notFound("Referência de pagamento desconhecida."));

        // O fallback por `reference` só é seguro quando o pedido ainda não tem
        // referência de pagamento (gravação falhou) ou quando coincide com o id
        // notificado. Sem isto, uma referência arbitrária confirmava outro pedido.
        if (order.getPaymentReference() != null
                && !order.getPaymentReference().equals(paymentId)) {
            throw ApiException.notFound("Referência de pagamento desconhecida.");
        }

        if (!EVENT_PAYMENT_SUCCESS.equalsIgnoreCase(event)) {
            // payment.failed (ou um evento que não conhecemos): o pagamento não foi
            // concluído. Não se cancela automaticamente o pedido — quem decide é a
            // operação, olhando para o painel do provedor. Fica uma incidência
            // ABERTA na fila de reconciliação (antes era só uma linha no log, que
            // ninguém voltava a ver).
            log.warn("Notificação '{}' para o pedido {} (pagamento {}) — revisão manual necessária",
                    event, order.getId(), paymentId);
            incidentService.record(order.getId(), paymentId, PaymentIncident.TYPE_WEBHOOK_FAILED,
                    "Evento recebido do gateway: " + event);
            return order.getId();
        }

        // O dinheiro foi cobrado, mas o pedido já tinha sido cancelado (expiração,
        // cancelamento manual). Não se reabre um pedido cancelado: fica uma
        // incidência para a operação estornar/decidir no painel do provedor.
        if (order.getStatus() == OrderStatus.CANCELADO) {
            log.error("Pagamento {} confirmado para o pedido JÁ CANCELADO {} — estorno manual necessário",
                    paymentId, order.getId());
            incidentService.record(order.getId(), paymentId, PaymentIncident.TYPE_REFUND_FAILED,
                    "Pagamento confirmado pelo gateway depois de o pedido ter sido cancelado. "
                            + "É necessário estornar manualmente.");
            return order.getId();
        }

        if (order.getStatus().ordinal() >= OrderStatus.PAGAMENTO_CONFIRMADO.ordinal()) {
            // Já confirmado (ou mais à frente): repetição da notificação — sem efeito.
            return order.getId();
        }
        if (order.getStatus() == OrderStatus.AGUARDA_PAGAMENTO
                || order.getStatus() == OrderStatus.PEDIDO_RECEBIDO) {
            // Montante/moeda: a assinatura prova a origem, mas não que o valor
            // cobrado corresponde ao pedido. Só se confirma com os valores certos.
            if (!valuesMatchOrder(data, order)) {
                log.error("Notificação de pagamento com montante/moeda divergente — pedido {} (pagamento {})",
                        order.getId(), paymentId);
                incidentService.record(order.getId(), paymentId, PaymentIncident.TYPE_WEBHOOK_FAILED,
                        "Montante ou moeda da notificação não corresponde ao total do pedido "
                                + order.getTotal() + " MZN. Pedido NÃO confirmado.");
                return order.getId();
            }
            order.setStatus(OrderStatus.PAGAMENTO_CONFIRMADO);
            // O checkout já passou: o URL de pagamento não deve ficar exposto.
            order.setCheckoutUrl(null);
            orderRepository.save(order);
            log.info("Pagamento confirmado por webhook para o pedido {}", order.getId());
        }
        return order.getId();
    }

    /**
     * Confirma que o montante e a moeda notificados correspondem ao pedido.
     * Campos ausentes são tolerados (gateways antigos); quando presentes, uma
     * divergência bloqueia a confirmação.
     */
    private static boolean valuesMatchOrder(JsonNode data, Order order) {
        JsonNode amountNode = data == null ? null : data.get("amount");
        if (amountNode != null && !amountNode.isNull() && order.getTotal() != null) {
            try {
                java.math.BigDecimal notified = amountNode.isNumber()
                        ? amountNode.decimalValue()
                        : new java.math.BigDecimal(amountNode.asText().trim());
                if (notified.compareTo(order.getTotal()) != 0) {
                    return false;
                }
            } catch (NumberFormatException e) {
                return false;
            }
        }
        String currency = text(data, "currency");
        return currency == null || "MZN".equalsIgnoreCase(currency);
    }

    /** HMAC-SHA256 do corpo cru comparado em tempo constante. */
    private boolean signatureMatches(String rawBody, String signature) {
        if (signature == null || signature.isBlank()) {
            return false;
        }
        String provided = signature.trim().toLowerCase();
        if (provided.startsWith("sha256=")) {
            provided = provided.substring("sha256=".length());
        }
        String expected = hmacHex(rawBody == null ? "" : rawBody);
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8));
    }

    private String hmacHex(String body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            // Falha de criptografia não pode virar "assinatura aceite".
            throw ApiException.serviceUnavailable("Não foi possível validar a notificação.");
        }
    }

    private JsonNode parse(String rawBody) {
        try {
            return objectMapper.readTree(rawBody == null ? "" : rawBody);
        } catch (IOException e) {
            throw ApiException.badRequest("Notificação de pagamento inválida.");
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        String s = value.asText();
        return s.isBlank() ? null : s;
    }
}
