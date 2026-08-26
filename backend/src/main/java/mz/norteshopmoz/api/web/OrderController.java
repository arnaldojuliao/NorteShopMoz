package mz.norteshopmoz.api.web;

import jakarta.validation.Valid;
import java.util.List;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.OrderService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import mz.norteshopmoz.api.web.dto.OrderRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Pedidos — endpoints autenticados (token JWT). */
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping
    public ResponseEntity<?> createOrder(
            @Valid @RequestBody OrderRequest request,
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @AuthenticationPrincipal UserPrincipal principal) {
        Order order = orderService.createOrder(request, principal == null ? null : principal.id(), idempotencyKey);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(order));
    }

    @GetMapping
    public ResponseEntity<?> listMyOrders(@AuthenticationPrincipal UserPrincipal principal) {
        List<Order> orders = orderService.getMyOrders(principal.id());
        return ResponseEntity.ok(ApiResponse.data(orders));
    }

    /**
     * Lista todos os pedidos (admin) — GET /api/orders/admin/all?status=Enviado.
     * Apenas utilizadores com role ADMIN (matcher específico no SecurityConfig).
     */
    @GetMapping("/admin/all")
    public ResponseEntity<?> listAllOrders(
            @RequestParam(name = "status", required = false) String status,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
        if (!"ADMIN".equalsIgnoreCase(principal.role())) {
            throw ApiException.forbidden("Apenas administradores podem listar todos os pedidos");
        }
        return ResponseEntity.ok(ApiResponse.data(orderService.listAllOrders(status)));
    }

    /**
     * Transiciona o estado do pedido (admin) — PATCH /api/orders/{id}/status.
     * Apenas utilizadores com role ADMIN; transições apenas para a frente.
     */
    @PatchMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(
            @PathVariable String id,
            @Valid @RequestBody OrderRequest.StatusRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
        if (!"ADMIN".equalsIgnoreCase(principal.role())) {
            throw ApiException.forbidden("Apenas administradores podem atualizar o estado de pedidos");
        }
        return ResponseEntity.ok(ApiResponse.data(orderService.updateStatus(id, request.status())));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getOrder(@PathVariable String id, @AuthenticationPrincipal UserPrincipal principal) {
        // Lookup público por ID (guest): pedidos de convidados são consultáveis sem token;
        // pedidos de utilizadores exigem ser o dono (admins veem qualquer pedido — ver OrderService.getOrder).
        return ResponseEntity.ok(ApiResponse.data(orderService.getOrder(id, principal)));
    }
}
