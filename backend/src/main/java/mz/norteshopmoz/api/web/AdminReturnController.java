package mz.norteshopmoz.api.web;

import java.util.Map;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.ReturnRequestService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Devoluções — endpoints admin
 * (GET /api/admin/returns, PATCH /api/admin/returns/{id}).
 *
 * <p>A decisão da operação fecha o ciclo iniciado pelo cliente em
 * {@code POST /api/returns/{orderId}}: aprovar tenta o estorno (pagamento
 * online) e fecha como REEMBOLSADA; rejeitar é final.</p>
 */
@RestController
@RequestMapping("/api/admin/returns")
public class AdminReturnController {

    private final ReturnRequestService returnRequestService;

    public AdminReturnController(ReturnRequestService returnRequestService) {
        this.returnRequestService = returnRequestService;
    }

    /** Corpo de PATCH /{id} — decisão + nota opcional. */
    public record ReturnDecision(String decision, String adminNote) {}

    /** Lista as devoluções — ?status=PEDIDO (ou todas). */
    @GetMapping
    public ResponseEntity<?> list(
            @RequestParam(name = "status", required = false) String status,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        return ResponseEntity.ok(ApiResponse.data(returnRequestService.listAdmin(status)));
    }

    /** Decide uma devolução (APROVADA/REJEITADA). */
    @PatchMapping("/{id}")
    public ResponseEntity<?> decide(
            @PathVariable Long id,
            @RequestBody ReturnDecision body,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        if (body == null) {
            throw ApiException.badRequest("Indique a decisão (APROVADA ou REJEITADA)");
        }
        return ResponseEntity.ok(ApiResponse.data(
                returnRequestService.decide(id, body.decision(), body.adminNote(), principal.id())));
    }

    /**
     * Tenta de novo o estorno de uma devolução APROVADA cujo estorno falhou
     * (gateway em baixo no primeiro attempt). Sucesso → REEMBOLSADA.
     */
    @PostMapping("/{id}/retry-refund")
    public ResponseEntity<?> retryRefund(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        return ResponseEntity.ok(ApiResponse.data(returnRequestService.retryRefund(id, principal.id())));
    }

    private static void requireAdmin(UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
        if (!"ADMIN".equalsIgnoreCase(principal.role())) {
            throw ApiException.forbidden("Apenas administradores podem gerir devoluções");
        }
    }
}
