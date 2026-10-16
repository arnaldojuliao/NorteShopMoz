package mz.norteshopmoz.api.web;

import java.util.Map;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.CatalogService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Moderação de avaliações — endpoints admin
 * (GET /api/admin/reviews, DELETE /api/admin/reviews/{id}).
 *
 * <p>As avaliações são submetidas por clientes autenticados em
 * {@code POST /api/products/{slug}/reviews} e ficam visíveis na loja de
 * imediato; estes endpoints dão ao admin a lista completa e a remoção (ex.:
 * comentários abusivos ou spam). O matcher em {@code SecurityConfig} exige
 * role ADMIN antes do {@code denyAll} de {@code /api/admin/**}.</p>
 */
@RestController
@RequestMapping("/api/admin/reviews")
public class ReviewAdminController {

    private final CatalogService catalogService;

    public ReviewAdminController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    /** Lista todas as avaliações da loja, paginadas (mais recentes primeiro). */
    @GetMapping
    public ResponseEntity<?> list(
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        return ResponseEntity.ok(ApiResponse.data(catalogService.listAllReviews(page, size)));
    }

    /** Remove uma avaliação e recalcula a média do produto. */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        catalogService.deleteReview(id);
        return ResponseEntity.ok(ApiResponse.data(Map.of("deleted", true)));
    }

    private static void requireAdmin(UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
        if (!"ADMIN".equalsIgnoreCase(principal.role())) {
            throw ApiException.forbidden("Apenas administradores podem moderar avaliações");
        }
    }
}
