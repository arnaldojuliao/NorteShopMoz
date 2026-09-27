package mz.norteshopmoz.api.web;

import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import mz.norteshopmoz.api.domain.Coupon;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.CouponService;
import mz.norteshopmoz.api.service.OrderService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import mz.norteshopmoz.api.web.dto.CouponValidateRequest;
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
    private final CouponService couponService;

    public OrderController(OrderService orderService, CouponService couponService) {
        this.orderService = orderService;
        this.couponService = couponService;
    }

    @PostMapping
    public ResponseEntity<?> createOrder(
            @Valid @RequestBody OrderRequest request,
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @AuthenticationPrincipal UserPrincipal principal) {
        Order order = orderService.createOrder(request, principal == null ? null : principal.id(), idempotencyKey);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(order));
    }

    /** Valida um cupão (sem o aplicar) — usado pelo frontend no checkout/carrinho. */
    @PostMapping("/validate-coupon")
    public ResponseEntity<?> validateCoupon(@Valid @RequestBody CouponValidateRequest request) {
        // Aceita convidado também (o cupão é válido para qualquer comprador).
        BigDecimal base = request.subtotal() != null ? request.subtotal() : BigDecimal.ZERO;
        Coupon coupon = couponService.validate(request.code(), base);
        BigDecimal discount = couponService.calculate(coupon, base);
        return ResponseEntity.ok(ApiResponse.data(Map.of(
                "code", coupon.getCode(),
                "discountType", coupon.getDiscountType(),
                "discountValue", coupon.getDiscountValue(),
                "discount", discount,
                "minimumSubtotal", coupon.getMinimumSubtotal()
        )));
    }

    @GetMapping
    public ResponseEntity<?> listMyOrders(@AuthenticationPrincipal UserPrincipal principal) {
        List<Order> orders = orderService.getMyOrders(principal.id());
        return ResponseEntity.ok(ApiResponse.data(orders));
    }

    /**
     * Página de pedidos (admin) —
     * GET /api/orders/admin/all?status=Enviado&page=0&size=20.
     * Apenas utilizadores com role ADMIN (matcher específico no SecurityConfig).
     *
     * <p>Paginado desde o início (a resposta antiga trazia o histórico todo, com
     * itens): o filtro de estado e o limite são resolvidos no SQL.</p>
     */
    @GetMapping("/admin/all")
    public ResponseEntity<?> listAllOrders(
            @RequestParam(name = "status", required = false) String status,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
        if (!"ADMIN".equalsIgnoreCase(principal.role())) {
            throw ApiException.forbidden("Apenas administradores podem listar todos os pedidos");
        }
        return ResponseEntity.ok(ApiResponse.data(orderService.listAllOrders(status, page, size)));
    }

    /**
     * Estatísticas gerais de vendas (admin) — GET /api/orders/admin/stats.
     * Toda a agregação é feita no SQL (ver OrderService.salesStats) e o acesso é
     * restrito a ADMIN por um matcher específico no SecurityConfig.
     */
    @GetMapping("/admin/stats")
    public ResponseEntity<?> stats(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
        if (!"ADMIN".equalsIgnoreCase(principal.role())) {
            throw ApiException.forbidden("Apenas administradores podem ver as estatísticas");
        }
        return ResponseEntity.ok(ApiResponse.data(orderService.salesStats()));
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
    public ResponseEntity<?> getOrder(
            @PathVariable String id,
            @RequestParam(name = "email", required = false) String email,
            @AuthenticationPrincipal UserPrincipal principal) {
        // Lookup por ID. Pedidos de conta exigem ser o dono (admins veem qualquer
        // pedido). Pedidos de convidado exigem também a prova de contacto
        // (`email`, que o link do email de acompanhamento transporta) — ver
        // OrderService.getOrder.
        return ResponseEntity.ok(ApiResponse.data(orderService.getOrder(id, principal, email)));
    }
}
