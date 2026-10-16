package mz.norteshopmoz.api.web;

import jakarta.servlet.http.HttpServletRequest;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.AdminUserService;
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
 * Gestão de utilizadores — endpoints admin
 * (GET /api/admin/users, PATCH /{id}/role, PATCH /{id}/ban).
 *
 * <p>O matcher em {@code SecurityConfig} exige role ADMIN antes do
 * {@code denyAll} de {@code /api/admin/**}. Cada mutação fica registada na
 * auditoria ({@code ADMIN_EVENT}).</p>
 */
@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {

    private final AdminUserService adminUserService;

    public AdminUserController(AdminUserService adminUserService) {
        this.adminUserService = adminUserService;
    }

    /** Lista paginada de contas — ?q=pesquisa&page=0&size=20. */
    @GetMapping
    public ResponseEntity<?> list(
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        return ResponseEntity.ok(ApiResponse.data(adminUserService.list(q, page, size)));
    }

    /** Corpo de PATCH /{id}/role e /{id}/ban. */
    public record AdminUserAction(String role, String reason) {}

    /** Promove/demote a role (ADMIN ↔ CUSTOMER). */
    @PatchMapping("/{id}/role")
    public ResponseEntity<?> setRole(
            @PathVariable String id,
            @RequestBody AdminUserAction body,
            @AuthenticationPrincipal UserPrincipal principal,
            HttpServletRequest request) {
        requireAdmin(principal);
        return ResponseEntity.ok(ApiResponse.data(
                adminUserService.setRole(id, body == null ? null : body.role(), principal, request)));
    }

    /** Bloqueia uma conta (recusa login e revoga sessões). */
    @PatchMapping("/{id}/ban")
    public ResponseEntity<?> ban(
            @PathVariable String id,
            @RequestBody AdminUserAction body,
            @AuthenticationPrincipal UserPrincipal principal,
            HttpServletRequest request) {
        requireAdmin(principal);
        return ResponseEntity.ok(ApiResponse.data(
                adminUserService.ban(id, body == null ? null : body.reason(), principal, request)));
    }

    /** Desbloqueia uma conta. */
    @PatchMapping("/{id}/unban")
    public ResponseEntity<?> unban(
            @PathVariable String id,
            @AuthenticationPrincipal UserPrincipal principal,
            HttpServletRequest request) {
        requireAdmin(principal);
        return ResponseEntity.ok(ApiResponse.data(adminUserService.unban(id, principal, request)));
    }

    /** Paridade com os restantes controllers admin (defesa em profundidade — o filtro JWT já garante a role). */
    private static void requireAdmin(UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
        if (!"ADMIN".equalsIgnoreCase(principal.role())) {
            throw ApiException.forbidden("Apenas administradores podem gerir utilizadores");
        }
    }
}
