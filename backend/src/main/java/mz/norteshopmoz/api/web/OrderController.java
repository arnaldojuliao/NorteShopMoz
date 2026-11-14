package mz.norteshopmoz.api.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import mz.norteshopmoz.api.domain.Coupon;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.OrderStatus;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.CouponService;
import mz.norteshopmoz.api.service.OrderQueryService;
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
    private final OrderQueryService orderQueryService;
    private final CouponService couponService;

    public OrderController(OrderService orderService, OrderQueryService orderQueryService,
            CouponService couponService) {
        this.orderService = orderService;
        this.orderQueryService = orderQueryService;
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
        List<Order> orders = orderQueryService.getMyOrders(principal.id());
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
        return ResponseEntity.ok(ApiResponse.data(orderQueryService.listAllOrders(status, page, size)));
    }

    /**
     * Estatísticas gerais de vendas (admin) — GET /api/orders/admin/stats.
     * Toda a agregação é feita no SQL (ver OrderService.salesStats) e o acesso é
     * restrito a ADMIN por um matcher específico no SecurityConfig.
     *
     * <p>Com {@code ?from=2026-10-01&to=2026-11-01} (ISO, UTC) devolve apenas o
     * período — janela [from, to), o limite superior é exclusivo. Sem datas,
     * devolve a visão total (como sempre).</p>
     */
    @GetMapping("/admin/stats")
    public ResponseEntity<?> stats(
            @RequestParam(name = "from", required = false) String from,
            @RequestParam(name = "to", required = false) String to,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal, "Apenas administradores podem ver as estatísticas");
        if (from == null && to == null) {
            return ResponseEntity.ok(ApiResponse.data(orderQueryService.salesStats()));
        }
        Instant[] window = parsePeriod(from, to);
        return ResponseEntity.ok(ApiResponse.data(orderQueryService.salesStats(window[0], window[1])));
    }

    /**
     * Exportação CSV de pedidos (admin) — GET /api/orders/admin/export.
     * Mesmos filtros de período que as estatísticas; estado opcional.
     * Content-Type text/csv com BOM UTF-8 (o Excel reconhece os acentos).
     */
    @GetMapping("/admin/export")
    public ResponseEntity<byte[]> exportCsv(
            @RequestParam(name = "from", required = false) String from,
            @RequestParam(name = "to", required = false) String to,
            @RequestParam(name = "status", required = false) String status,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal, "Apenas administradores podem exportar pedidos");
        Instant[] window = parsePeriod(from, to);
        OrderStatus orderStatus = null;
        if (status != null && !status.isBlank()) {
            orderStatus = OrderStatus.fromLabel(status)
                    .orElseThrow(() -> ApiException.badRequest("Estado inválido: " + status));
        }
        List<Object[]> rows = orderQueryService.exportRows(window[0], window[1], orderStatus);

        StringBuilder csv = new StringBuilder();
        csv.append('\ufeff'); // BOM UTF-8
        csv.append("id;data;estado;subtotal;desconto;envio;total;metodo_pagamento;"
                + "referencia_pagamento;tracking;cupao;cliente;telefone;email;provincia;cidade\r\n");
        java.time.format.DateTimeFormatter dateFmt =
                java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
                        .withZone(java.time.ZoneId.of("UTC"));
        for (Object[] row : rows) {
            csv.append(csvCell(row[0])).append(';');
            csv.append(row[1] == null ? "" : dateFmt.format((java.time.Instant) row[1])).append(';');
            csv.append(csvCell(row[2])).append(';'); // estado (rótulo, via @JsonValue do enum)
            csv.append(csvCell(row[3])).append(';');
            csv.append(csvCell(row[4])).append(';');
            csv.append(csvCell(row[5])).append(';');
            csv.append(csvCell(row[6])).append(';');
            csv.append(csvCell(row[7])).append(';');
            csv.append(csvCell(row[8])).append(';');
            csv.append(csvCell(row[9])).append(';');
            csv.append(csvCell(row[10])).append(';');
            csv.append(csvCell(row[11])).append(';');
            csv.append(csvCell(row[12])).append(';');
            csv.append(csvCell(row[13])).append(';');
            csv.append(csvCell(row[14])).append(';');
            csv.append(csvCell(row[15])).append("\r\n");
        }
        String filename = "pedidos_" + from + "_" + (orderStatus == null ? "todos" : orderStatus.name())
                + ".csv";
        return ResponseEntity.ok()
                .header("Content-Disposition", "attachment; filename=\"" + filename + "\"")
                .header("Content-Type", "text/csv; charset=UTF-8")
                .body(csv.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    /** Escape CSV (ponto e vírgula é o separador que o Excel PT espera). */
    private static String csvCell(Object value) {
        if (value == null) {
            return "";
        }
        String s = String.valueOf(value).replace("\"", "\"\"");
        return s.contains(";") || s.contains("\"") || s.contains("\n") ? "\"" + s + "\"" : s;
    }

    /** Converte ?from&to (datas ISO ou ISO-instant) em janela [from, to). */
    private static Instant[] parsePeriod(String from, String to) {
        if (from == null || from.isBlank() || to == null || to.isBlank()) {
            throw ApiException.badRequest("Indique 'from' e 'to' (ex.: from=2026-10-01&to=2026-11-01)");
        }
        try {
            Instant start = parseInstant(from, false);
            Instant end = parseInstant(to, true);
            if (!start.isBefore(end)) {
                throw ApiException.badRequest("Período inválido: 'from' tem de ser anterior a 'to'");
            }
            return new Instant[] { start, end };
        } catch (java.time.format.DateTimeParseException e) {
            throw ApiException.badRequest("Datas inválidas — use o formato ISO (2026-10-01)");
        }
    }

    /** Data ISO (2026-10-01) → instante (início/exclusivo do dia, UTC). */
    private static Instant parseInstant(String value, boolean endOfDayExclusive) {
        if (value.contains("T") || value.contains("Z")) {
            return Instant.parse(value);
        }
        java.time.LocalDate date = java.time.LocalDate.parse(value);
        return endOfDayExclusive ? date.plusDays(1).atStartOfDay().toInstant(java.time.ZoneOffset.UTC)
                : date.atStartOfDay().toInstant(java.time.ZoneOffset.UTC);
    }

    private static void requireAdmin(UserPrincipal principal, String forbiddenMessage) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
        if (!"ADMIN".equalsIgnoreCase(principal.role())) {
            throw ApiException.forbidden(forbiddenMessage);
        }
    }

    /**
     * Transiciona o estado do pedido (admin) — PATCH /api/orders/{id}/status.
     * Apenas utilizadores com role ADMIN; transições apenas para a frente.
     * Aceita opcionalmente o código de tracking do envio.
     */
    @PatchMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(
            @PathVariable String id,
            @Valid @RequestBody OrderRequest.StatusRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal, "Apenas administradores podem atualizar o estado de pedidos");
        return ResponseEntity.ok(ApiResponse.data(
                orderService.updateStatus(id, request.status(), request.trackingCode())));
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
        return ResponseEntity.ok(ApiResponse.data(orderQueryService.getOrder(id, principal, email)));
    }

    /**
     * Admin define o link de pagamento de um pedido em «Aguarda pagamento» —
     * POST /api/orders/admin/{id}/payment-link. Usado quando o gateway não
     * devolveu link no checkout: o admin cola-o aqui e o cliente é avisado.
     * É o ÚNICO caminho para um link: o cliente nunca gere o seu próprio.
     */
    @PostMapping("/admin/{id}/payment-link")
    public ResponseEntity<?> setPaymentLink(
            @PathVariable String id,
            @Valid @RequestBody PaymentLinkRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal, "Apenas administradores podem definir o link de pagamento");
        return ResponseEntity.ok(ApiResponse.data(
                orderService.setPaymentLinkByAdmin(id, request.url())));
    }

    /** Corpo do POST /api/orders/admin/{id}/payment-link. */
    public record PaymentLinkRequest(
            @NotBlank(message = "Link de pagamento é obrigatório")
            @Size(max = 500, message = "Link demasiado longo") String url) {}
}
