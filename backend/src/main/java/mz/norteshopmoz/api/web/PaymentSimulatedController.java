package mz.norteshopmoz.api.web;

import java.util.Map;
import java.util.Optional;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.OrderStatus;
import mz.norteshopmoz.api.domain.PaymentIncident;
import mz.norteshopmoz.api.repository.OrderRepository;
import mz.norteshopmoz.api.service.PaymentIncidentService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Resultado do pagamento na página SIMULADA (dev/demo — nunca em {@code prod}).
 *
 * <p>A página {@code /pagamento-simulado} imita o provedor: o cliente paga lá e
 * a confirmação chega aqui — o mesmo desenho do webhook real da PaySuite
 * ({@code PaymentWebhookService}), só que sem assinatura HMAC, porque o
 * "provedor" é a própria loja num ambiente de demonstração.</p>
 *
 * <p><strong>Porque não pode existir em produção</strong>: um endpoint que
 * confirma pagamentos sem assinatura seria dinheiro de graça. O bean inteiro
 * está guardado por {@code @Profile("!prod")} — em prod os pedidos pagos online
 * passam pela PaySuite e pelo webhook assinado, sem atalho.</p>
 */
@RestController
@RequestMapping("/api/payments/simulated")
@Profile("!prod")
public class PaymentSimulatedController {

    private final OrderRepository orderRepository;
    private final PaymentIncidentService incidentService;

    public PaymentSimulatedController(OrderRepository orderRepository,
            PaymentIncidentService incidentService) {
        this.orderRepository = orderRepository;
        this.incidentService = incidentService;
    }

    /** Corpo de confirm/fail — a referência do pagamento simulado (SIM-…). */
    public record SimulatedResultRequest(String ref) {}

    /**
     * O cliente "pagou" na página simulada — mesma transição do webhook
     * {@code payment.success}: idempotente (repetir não avança um pedido já
     * confirmado) e limpa o URL de checkout.
     */
    @PostMapping("/confirm")
    @Transactional
    public ResponseEntity<?> confirm(@RequestBody SimulatedResultRequest body) {
        Order order = findByReference(body == null ? null : body.ref())
                .orElseThrow(() -> mz.norteshopmoz.api.exception.ApiException.notFound(
                        "Pagamento simulado desconhecido."));
        if (order.getStatus().ordinal() >= OrderStatus.PAGAMENTO_CONFIRMADO.ordinal()
                && order.getStatus() != OrderStatus.CANCELADO) {
            // Já confirmado (ou mais à frente): repetição da página — sem efeito.
            return ResponseEntity.ok(ApiResponse.data(Map.of("orderId", order.getId(), "status",
                    order.getStatus().getLabel())));
        }
        if (order.getStatus() == OrderStatus.AGUARDA_PAGAMENTO
                || order.getStatus() == OrderStatus.PEDIDO_RECEBIDO) {
            order.setStatus(OrderStatus.PAGAMENTO_CONFIRMADO);
            order.setCheckoutUrl(null);
            orderRepository.save(order);
        }
        return ResponseEntity.ok(ApiResponse.data(Map.of("orderId", order.getId(), "status",
                order.getStatus().getLabel())));
    }

    /**
     * O cliente "falhou" o pagamento na página simulada — mesma decisão do
     * webhook {@code payment.failed}: não se cancela automaticamente; fica a
     * incidência na fila de reconciliação para a operação decidir.
     */
    @PostMapping("/fail")
    @Transactional
    public ResponseEntity<?> fail(@RequestBody SimulatedResultRequest body) {
        Order order = findByReference(body == null ? null : body.ref())
                .orElseThrow(() -> mz.norteshopmoz.api.exception.ApiException.notFound(
                        "Pagamento simulado desconhecido."));
        incidentService.record(order.getId(), order.getPaymentReference(),
                PaymentIncident.TYPE_WEBHOOK_FAILED, "Pagamento falhado na página simulada (demo).");
        return ResponseEntity.ok(ApiResponse.data(Map.of("orderId", order.getId())));
    }

    /** Encontra o pedido pela referência do pagamento simulado (ou pelo id do pedido). */
    private Optional<Order> findByReference(String ref) {
        if (ref == null || ref.isBlank()) {
            return Optional.empty();
        }
        return orderRepository.findByPaymentReference(ref.trim())
                .or(() -> orderRepository.findById(ref.trim()));
    }
}
