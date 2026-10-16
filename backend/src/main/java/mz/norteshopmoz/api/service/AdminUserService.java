package mz.norteshopmoz.api.service;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import mz.norteshopmoz.api.domain.UserAccount;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.UserRepository;
import mz.norteshopmoz.api.security.AuditService;
import mz.norteshopmoz.api.security.RefreshTokenService;
import mz.norteshopmoz.api.security.SessionRevocationService;
import mz.norteshopmoz.api.security.UserPrincipal;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gestão de utilizadores pela operação (painel admin).
 *
 * <p>Até agora não havia qualquer forma de listar clientes, promover um
 * colega a admin ou bloquear uma conta abusiva — era preciso ir à base de
 * dados. Tudo o que este serviço faz fica registado na auditoria
 * ({@code ADMIN_EVENT}).</p>
 *
 * <p><strong>Propagação da role/bloqueio</strong>: o JWT é stateless (a role
 * vai no token, válido 1 h). Ao mudar a role ou bloquear, revogam-se as
 * sessões ({@link SessionRevocationService} corta tokens emitidos antes do
 * momento) e os refresh tokens — o cliente perde o acesso no pedido seguinte,
 * sem esperar pela expiração do access token.</p>
 */
@Service
public class AdminUserService {

    /** Tamanho de página por omissão e teto (igual ao painel de pedidos). */
    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 100;

    private final UserRepository userRepository;
    private final SessionRevocationService sessionRevocationService;
    private final RefreshTokenService refreshTokenService;
    private final AuditService auditService;

    public AdminUserService(UserRepository userRepository,
            SessionRevocationService sessionRevocationService,
            RefreshTokenService refreshTokenService,
            AuditService auditService) {
        this.userRepository = userRepository;
        this.sessionRevocationService = sessionRevocationService;
        this.refreshTokenService = refreshTokenService;
        this.auditService = auditService;
    }

    /** Lista paginada de contas, com pesquisa opcional por email ou nome. */
    @Transactional(readOnly = true)
    public Map<String, Object> list(String query, int page, int size) {
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        Pageable pageable = PageRequest.of(Math.max(page, 0), safeSize,
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")));

        String q = query == null ? "" : query.trim();
        Page<UserAccount> result = q.isEmpty()
                ? userRepository.findAll(pageable)
                : userRepository.search(q, pageable);

        return new LinkedHashMap<>(Map.of(
                "users", result.getContent().stream().map(AdminUserService::toDto).toList(),
                "page", result.getNumber(),
                "size", result.getSize(),
                "total", result.getTotalElements(),
                "totalPages", result.getTotalPages()));
    }

    /** Promove/demote a role de uma conta (ADMIN ↔ CUSTOMER). */
    @Transactional
    public Map<String, Object> setRole(String id, String role, UserPrincipal admin, HttpServletRequest request) {
        String normalized = role == null ? "" : role.trim().toUpperCase();
        if (!normalized.equals("ADMIN") && !normalized.equals("CUSTOMER")) {
            throw ApiException.badRequest("Role inválida: use ADMIN ou CUSTOMER");
        }
        if (admin != null && admin.id().equals(id) && !normalized.equals("ADMIN")) {
            // Um admin não se pode rebaixar a si próprio: se fosse o único admin,
            // a operação ficava sem acesso ao painel (o erro 400 explica o porquê).
            throw ApiException.badRequest("Não pode alterar a sua própria role — peça a outro administrador");
        }
        UserAccount user = userRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Utilizador não encontrado"));
        if (normalized.equals(user.getRole())) {
            throw ApiException.conflict("A conta já tem a role " + normalized);
        }
        user.setRole(normalized);
        userRepository.save(user);
        // A role vai no JWT: corta as sessões ativas para a mudança valer já.
        revokeSessions(user);
        auditService.logAdminEvent("USER_ROLE_CHANGED", admin == null ? null : admin.id(),
                AuditService.getClientIp(request), id, "role=" + normalized);
        return toDto(user);
    }

    /** Bloqueia uma conta: recusa login e revoga sessões ativas. */
    @Transactional
    public Map<String, Object> ban(String id, String reason, UserPrincipal admin, HttpServletRequest request) {
        if (admin != null && admin.id().equals(id)) {
            throw ApiException.badRequest("Não pode bloquear a sua própria conta");
        }
        UserAccount user = userRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Utilizador não encontrado"));
        if (user.isBanned()) {
            throw ApiException.conflict("A conta já está bloqueada");
        }
        user.setBanned(true);
        user.setBannedReason(reason == null || reason.isBlank() ? null : reason.trim());
        userRepository.save(user);
        revokeSessions(user);
        auditService.logAdminEvent("USER_BANNED", admin == null ? null : admin.id(),
                AuditService.getClientIp(request), id, user.getBannedReason() == null ? "" : user.getBannedReason());
        return toDto(user);
    }

    /** Desbloqueia uma conta. */
    @Transactional
    public Map<String, Object> unban(String id, UserPrincipal admin, HttpServletRequest request) {
        UserAccount user = userRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Utilizador não encontrado"));
        if (!user.isBanned()) {
            throw ApiException.conflict("A conta não está bloqueada");
        }
        user.setBanned(false);
        user.setBannedReason(null);
        userRepository.save(user);
        auditService.logAdminEvent("USER_UNBANNED", admin == null ? null : admin.id(),
                AuditService.getClientIp(request), id, "");
        return toDto(user);
    }

    /** Revoga refresh tokens e sessões — a mudança vale no pedido seguinte. */
    private void revokeSessions(UserAccount user) {
        refreshTokenService.revokeAll(user.getId());
        sessionRevocationService.revokeAll(user.getId());
    }

    /** DTO público (sem hash de password, sem tokens). */
    private static Map<String, Object> toDto(UserAccount u) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", u.getId());
        dto.put("email", u.getEmail());
        dto.put("fullName", u.getFullName());
        dto.put("phone", u.getPhone());
        dto.put("role", u.getRole());
        dto.put("emailVerified", u.isEmailVerified());
        dto.put("authProvider", u.getAuthProvider());
        dto.put("banned", u.isBanned());
        dto.put("bannedReason", u.getBannedReason());
        dto.put("createdAt", u.getCreatedAt());
        return dto;
    }
}
