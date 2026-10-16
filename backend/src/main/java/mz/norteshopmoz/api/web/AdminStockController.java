package mz.norteshopmoz.api.web;

import java.util.Map;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.StockService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Inventário — endpoints admin
 * (PATCH /api/admin/stock/products/{id}, GET /api/admin/stock/low,
 * GET /api/admin/stock/movements).
 *
 * <p>O ajuste direto substitui a antiga solução de editar o produto inteiro
 * para corrigir uma contagem; os movimentos dão o histórico de cada alteração
 * e o {@code /low} alimenta o alerta do painel.</p>
 */
@RestController
@RequestMapping("/api/admin/stock")
public class AdminStockController {

    private final StockService stockService;

    public AdminStockController(StockService stockService) {
        this.stockService = stockService;
    }

    /** Corpo de PATCH /products/{id} — stock absoluto + motivo opcional. */
    public record StockAdjust(Integer stock, String detail) {}

    /** Ajusta o stock absoluto de um produto. */
    @PatchMapping("/products/{id}")
    public ResponseEntity<?> adjust(
            @PathVariable String id,
            @RequestBody StockAdjust body,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        if (body == null || body.stock() == null) {
            throw ApiException.badRequest("Indique o novo stock");
        }
        return ResponseEntity.ok(ApiResponse.data(
                stockService.adjustStock(id, body.stock(), body.detail(), principal.id())));
    }

    /** Produtos no/abaixo do limite — GET /api/admin/stock/low?threshold=10. */
    @GetMapping("/low")
    public ResponseEntity<?> low(
            @RequestParam(name = "threshold", required = false) Integer threshold,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        return ResponseEntity.ok(ApiResponse.data(Map.of("products", stockService.lowStock(threshold))));
    }

    /** Histórico de movimentos — GET /api/admin/stock/movements?productId=p-xxx&limit=50. */
    @GetMapping("/movements")
    public ResponseEntity<?> movements(
            @RequestParam(name = "productId", required = false) String productId,
            @RequestParam(name = "limit", defaultValue = "50") int limit,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        return ResponseEntity.ok(ApiResponse.data(stockService.movements(productId, limit)));
    }

    private static void requireAdmin(UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
        if (!"ADMIN".equalsIgnoreCase(principal.role())) {
            throw ApiException.forbidden("Apenas administradores podem gerir o inventário");
        }
    }
}
