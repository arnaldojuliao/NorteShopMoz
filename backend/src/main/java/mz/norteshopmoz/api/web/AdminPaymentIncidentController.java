package mz.norteshopmoz.api.web;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.PaymentIncidentService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Fila de reconciliação de pagamentos — endpoints admin
 * (GET /api/admin/payment-incidents, POST /{id}/resolve).
 *
 * <p>Cada incidência é um caso de pagamento que falhou e exige decisão: um
 * {@code payment.failed} recebido por webhook ou um estorno que falhou. O
 * "resolver" aqui diz "o caso foi tratado" (típic. no painel do provedor);
 * o retry de estorno vive no painel da devolução.</p>
 */
@RestController
@RequestMapping("/api/admin/payment-incidents")
public class AdminPaymentIncidentController {

    private final PaymentIncidentService incidentService;

    public AdminPaymentIncidentController(PaymentIncidentService incidentService) {
        this.incidentService = incidentService;
    }

    /** Corpo de POST /{id}/resolve. */
    public record ResolveRequest(String note) {}

    /** Lista as incidências — ?status=ABERTA (ou todas). */
    @GetMapping
    public ResponseEntity<?> list(
            @RequestParam(name = "status", required = false) String status,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        return ResponseEntity.ok(ApiResponse.data(incidentService.list(status)));
    }

    /** Marca o caso como resolvido (a operação tratou no painel do provedor). */
    @PostMapping("/{id}/resolve")
    public ResponseEntity<?> resolve(
            @PathVariable Long id,
            @RequestBody(required = false) ResolveRequest body,
            @AuthenticationPrincipal UserPrincipal principal,
            HttpServletRequest request) {
        requireAdmin(principal);
        Map<String, Object> resolved = Map.of("incident", incidentService.resolve(id, principal.id()),
                "note", body == null || body.note() == null ? "" : body.note());
        return ResponseEntity.ok(ApiResponse.data(resolved));
    }

    private static void requireAdmin(UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
        if (!"ADMIN".equalsIgnoreCase(principal.role())) {
            throw ApiException.forbidden("Apenas administradores podem gerir incidências de pagamento");
        }
    }
}
