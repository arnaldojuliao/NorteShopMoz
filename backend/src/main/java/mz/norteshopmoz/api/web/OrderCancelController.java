package mz.norteshopmoz.api.web;

import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.OrderService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Cancelamento de pedidos — dono do pedido ou admin. */
@RestController
@RequestMapping("/api/orders")
public class OrderCancelController {

    private final OrderService orderService;

    public OrderCancelController(OrderService orderService) {
        this.orderService = orderService;
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> cancel(
            @PathVariable String id,
            @AuthenticationPrincipal UserPrincipal principal) {
        Order cancelled = orderService.cancelOrder(id, principal);
        return ResponseEntity.ok(ApiResponse.data(cancelled));
    }
}
