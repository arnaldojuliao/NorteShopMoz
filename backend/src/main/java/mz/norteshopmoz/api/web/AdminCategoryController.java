package mz.norteshopmoz.api.web;

import jakarta.validation.Valid;
import java.util.List;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.AdminCategoryService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import mz.norteshopmoz.api.web.dto.CategoryRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Gestão de categorias — endpoints admin
 * (GET/POST /api/admin/categories, PUT/DELETE /api/admin/categories/{slug}).
 *
 * <p>Até aqui as categorias só mudavam por migration; com este controller a
 * operação cria/edita/apaga no painel. A leitura pública continua em
 * {@code GET /api/categories} (com contagens e cache).</p>
 */
@RestController
@RequestMapping("/api/admin/categories")
public class AdminCategoryController {

    private final AdminCategoryService adminCategoryService;

    public AdminCategoryController(AdminCategoryService adminCategoryService) {
        this.adminCategoryService = adminCategoryService;
    }

    @GetMapping
    public ResponseEntity<?> list(@AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        return ResponseEntity.ok(ApiResponse.data(adminCategoryService.list()));
    }

    @PostMapping
    public ResponseEntity<?> create(
            @Valid @RequestBody CategoryRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.data(adminCategoryService.create(request)));
    }

    @PutMapping("/{slug}")
    public ResponseEntity<?> update(
            @PathVariable String slug,
            @Valid @RequestBody CategoryRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        return ResponseEntity.ok(ApiResponse.data(adminCategoryService.update(slug, request)));
    }

    @DeleteMapping("/{slug}")
    public ResponseEntity<?> delete(
            @PathVariable String slug,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        return ResponseEntity.ok(ApiResponse.data(adminCategoryService.delete(slug)));
    }

    private static void requireAdmin(UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
        if (!"ADMIN".equalsIgnoreCase(principal.role())) {
            throw ApiException.forbidden("Apenas administradores podem gerir categorias");
        }
    }
}
