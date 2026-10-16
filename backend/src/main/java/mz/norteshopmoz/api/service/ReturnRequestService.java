package mz.norteshopmoz.api.service;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.OrderStatus;
import mz.norteshopmoz.api.domain.ReturnRequest;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.OrderRepository;
import mz.norteshopmoz.api.repository.ReturnRequestRepository;
import mz.norteshopmoz.api.security.UserPrincipal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Fluxo de devoluções — o que faltava ao tab "Devoluções" de /pedidos, que só
 * filtrava pedidos entregues e mandava o cliente para o WhatsApp.
 *
 * <p>Ciclo: o cliente pede (com motivo) dentro da janela → a operação aprova ou
 * rejeita → se aprovado e o pagamento foi online, o estorno é tentado logo;
 * sucesso fecha o caso como REEMBOLSADA, falha deixa APROVADA e abre uma
 * incidência na fila de reconciliação (visível no painel). Rejeitar é final.</p>
 *
 * <p><strong>Janela</strong>: os pedidos não registam a data de entrega, pelo
 * que a janela técnica conta da data do pedido ({@code RETURN_WINDOW_DAYS}, 30
 * dias — cobre o prazo de entrega até 11 dias mais os 7 dias do direito de
 * devolução anunciado). A operação pode sempre aprovar fora da janela.</p>
 */
@Service
public class ReturnRequestService {

    private static final Logger log = LoggerFactory.getLogger(ReturnRequestService.class);

    /** Janela para PEDIR devolução (dias, a contar da data do pedido). */
    public static final int RETURN_WINDOW_DAYS = 30;

    /** Comprimento máximo do motivo (a coluna é TEXT, mas o formulário não é um livro). */
    private static final int MAX_REASON_LENGTH = 2000;

    private final ReturnRequestRepository returnRepository;
    private final OrderRepository orderRepository;
    private final PaymentService paymentService;

    public ReturnRequestService(ReturnRequestRepository returnRepository,
            OrderRepository orderRepository, PaymentService paymentService) {
        this.returnRepository = returnRepository;
        this.orderRepository = orderRepository;
        this.paymentService = paymentService;
    }

    /** Cliente pede a devolução de um pedido entregue. */
    @Transactional
    public ReturnRequest request(String orderId, UserPrincipal principal, String reason) {
        if (reason == null || reason.isBlank()) {
            throw ApiException.badRequest("Indique o motivo da devolução");
        }
        String trimmed = reason.trim();
        if (trimmed.length() > MAX_REASON_LENGTH) {
            throw ApiException.badRequest("Motivo demasiado longo (máx. " + MAX_REASON_LENGTH + " caracteres)");
        }
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> ApiException.notFound("Pedido não encontrado"));

        boolean admin = principal != null && "ADMIN".equalsIgnoreCase(principal.role());
        if (!admin) {
            if (principal == null) {
                throw ApiException.unauthorized("Não autenticado");
            }
            if (order.getUserId() == null || !order.getUserId().equals(principal.id())) {
                // 404 (não 403): não confirmar a existência de pedidos alheios.
                throw ApiException.notFound("Pedido não encontrado");
            }
            if (order.getStatus() != OrderStatus.ENTREGUE) {
                throw ApiException.badRequest(
                        "Só é possível pedir a devolução de pedidos entregues");
            }
            if (order.getDate().plus(Duration.ofDays(RETURN_WINDOW_DAYS)).isBefore(Instant.now())) {
                throw ApiException.badRequest(
                        "A janela de devolução (" + RETURN_WINDOW_DAYS + " dias) terminou. Fale com o suporte.");
            }
        }
        if (returnRepository.findByOrderId(orderId).isPresent()) {
            throw ApiException.conflict("Este pedido já tem uma devolução registada");
        }
        ReturnRequest created = returnRepository.save(ReturnRequest.builder()
                .orderId(orderId)
                .userId(order.getUserId())
                .reason(trimmed)
                .status("PEDIDO")
                .build());
        log.info("Devolução pedida para o pedido {}", orderId);
        return created;
    }

    /** Devoluções do cliente (mais recentes primeiro), com o estado do pedido. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listMine(String userId) {
        return returnRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(this::toDto).toList();
    }

    /** Lista admin, opcionalmente filtrada por estado. */
    @Transactional(readOnly = true)
    public Map<String, Object> listAdmin(String status) {
        List<ReturnRequest> returns = status == null || status.isBlank()
                ? returnRepository.findAllByOrderByCreatedAtDesc()
                : returnRepository.findByStatusOrderByCreatedAtDesc(status.trim().toUpperCase());
        return new LinkedHashMap<>(Map.of("returns", returns.stream().map(this::toDto).toList()));
    }

    /**
     * Decisão da operação. {@code APROVADA} tenta o estorno imediatamente
     * (pagamento online); {@code REJEITADA} é final.
     */
    @Transactional
    public Map<String, Object> decide(Long id, String decision, String adminNote, String adminId) {
        String normalized = decision == null ? "" : decision.trim().toUpperCase();
        if (!normalized.equals("APROVADA") && !normalized.equals("REJEITADA")) {
            throw ApiException.badRequest("Decisão inválida: use APROVADA ou REJEITADA");
        }
        ReturnRequest ret = returnRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Devolução não encontrada"));
        if (ret.isTerminal()) {
            throw ApiException.conflict("A devolução já está fechada (" + ret.getStatus() + ")");
        }
        Order order = orderRepository.findById(ret.getOrderId()).orElse(null);
        if (order == null) {
            // O pedido não existe mais (expurgo de retenção) — fecha o caso
            // sem tentar estornar para uma referência órfã.
            ret.setStatus("REJEITADA");
            ret.setAdminNote(noteWith(adminNote, "Pedido já não existe"));
            ret.setUpdatedAt(Instant.now());
            return toDto(returnRepository.save(ret));
        }

        ret.setAdminNote(adminNote == null || adminNote.isBlank() ? null : adminNote.trim());
        ret.setUpdatedAt(Instant.now());

        if (normalized.equals("REJEITADA")) {
            ret.setStatus("REJEITADA");
            return toDto(returnRepository.save(ret));
        }

        // APROVADA: o valor a devolver é o total pago (envio incluído — a devolução
        // não foi culpa do cliente). Sem pagamento online (na entrega/transferência)
        // não há estorno a fazer: fecha como REEMBOLSADA com valor 0 e nota.
        ret.setStatus("APROVADA");
        String reference = order.getPaymentReference();
        if (reference == null || reference.isBlank()) {
            ret.setStatus("REEMBOLSADA");
            ret.setRefundAmount(java.math.BigDecimal.ZERO);
            ret.setAdminNote(noteWith(ret.getAdminNote(),
                    "Sem pagamento online — devolução aceite sem estorno"));
            log.info("Devolução do pedido {} aceite (pagamento offline — sem estorno)", ret.getOrderId());
        } else {
            // Estorno FORA do fluxo transacional do retorno: PaymentService.refund
            // nunca lança; falha abre incidência (REFUND_FAILED) e o caso fica
            // APROVADA para a operação tentar de novo no painel.
            paymentService.refund(reference, order.getTotal(), order.getId());
            // Sem exceção, o estorno foi aceite pelo gateway (PaySuite aceita o
            // pedido de reembolso; a confirmação final é do provedor).
            ret.setStatus("REEMBOLSADA");
            ret.setRefundAmount(order.getTotal());
        }
        return toDto(returnRepository.save(ret));
    }

    /** DTO com o contexto do pedido (o frontend mostra-o ao lado do estado). */
    private Map<String, Object> toDto(ReturnRequest ret) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", ret.getId());
        dto.put("orderId", ret.getOrderId());
        dto.put("userId", ret.getUserId());
        dto.put("reason", ret.getReason());
        dto.put("status", ret.getStatus());
        dto.put("adminNote", ret.getAdminNote());
        dto.put("refundAmount", ret.getRefundAmount());
        dto.put("createdAt", ret.getCreatedAt());
        dto.put("updatedAt", ret.getUpdatedAt());
        orderRepository.findById(ret.getOrderId()).ifPresent(order -> {
            Map<String, Object> orderInfo = new LinkedHashMap<>();
            orderInfo.put("id", order.getId());
            orderInfo.put("date", order.getDate());
            orderInfo.put("status", order.getStatus());
            orderInfo.put("total", order.getTotal());
            orderInfo.put("paymentMethod", order.getPaymentMethod());
            dto.put("order", orderInfo);
        });
        return dto;
    }

    private static String noteWith(String note, String addition) {
        String base = note == null || note.isBlank() ? "" : note.trim() + " — ";
        return base + addition;
    }
}
