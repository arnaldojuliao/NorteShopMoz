package mz.norteshopmoz.api.web;

import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.ReturnRequestService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Devoluções do cliente — POST /api/returns/{orderId} (pedir) e
 * GET /api/returns (as minhas).
 *
 * <p>Autenticado (qualquer cliente — {@code anyRequest().authenticated()} no
 * SecurityConfig): a devolução está ligada à conta do dono do pedido. Pedidos
 * de convidado continuam a tratar-se pelo suporte (o WhatsApp da página
 * /devolucoes), porque não há como provar a posse de uma conta inexistente.</p>
 */
@RestController
@RequestMapping("/api/returns")
public class ReturnController {

    private final ReturnRequestService returnRequestService;

    public ReturnController(ReturnRequestService returnRequestService) {
        this.returnRequestService = returnRequestService;
    }

    /** Corpo de POST /{orderId}. */
    public record ReturnCreateRequest(String reason) {}

    /** Pede a devolução de um pedido entregue (dono apenas). */
    @PostMapping("/{orderId}")
    public ResponseEntity<?> request(
            @PathVariable String orderId,
            @RequestBody ReturnCreateRequest body,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(
                returnRequestService.request(orderId, principal, body == null ? null : body.reason())));
    }

    /** As minhas devoluções (com o estado do pedido ao lado). */
    @GetMapping
    public ResponseEntity<?> mine(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
        return ResponseEntity.ok(ApiResponse.data(returnRequestService.listMine(principal.id())));
    }
}
