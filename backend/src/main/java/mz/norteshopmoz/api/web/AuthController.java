package mz.norteshopmoz.api.web;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import mz.norteshopmoz.api.config.JwtCookieService;
import mz.norteshopmoz.api.security.ClientIpResolver;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.AuthService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import mz.norteshopmoz.api.web.dto.AuthDtos.AuthResponse;
import mz.norteshopmoz.api.web.dto.AuthDtos.ForgotPasswordRequest;
import mz.norteshopmoz.api.web.dto.AuthDtos.LoginRequest;
import mz.norteshopmoz.api.web.dto.AuthDtos.RefreshTokenRequest;
import mz.norteshopmoz.api.web.dto.AuthDtos.RegisterRequest;
import mz.norteshopmoz.api.web.dto.AuthDtos.ResetPasswordRequest;
import mz.norteshopmoz.api.web.dto.AuthDtos.SocialLoginRequest;
import mz.norteshopmoz.api.web.dto.AuthDtos.UpdateAvatarRequest;
import mz.norteshopmoz.api.web.dto.AuthDtos.UserDto;
import mz.norteshopmoz.api.web.dto.AuthDtos.VerifyEmailCodeRequest;
import mz.norteshopmoz.api.web.dto.AuthDtos.VerifyEmailRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Autenticação JWT em cookies HttpOnly — registo e login públicos; /me autenticado. */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final JwtCookieService jwtCookieService;

    public AuthController(AuthService authService, JwtCookieService jwtCookieService) {
        this.authService = authService;
        this.jwtCookieService = jwtCookieService;
    }

    /**
     * Devolve um CSRF token utilizável como header {@code X-CSRF-Token}.
     *
     * <p>Existe porque o cookie {@code nsm_csrf} é host-only: quando a API está
     * num subdomínio, o JavaScript do frontend não o consegue ler e o header
     * seguia vazio (403 em todos os pedidos autenticados que alteram estado).
     * Reutiliza o cookie da sessão; se não existir, gera um novo.</p>
     *
     * <p>Não enfraquece o CSRF: o valor é imprevisível e o <em>atacante</em> não
     * consegue lê-lo — um pedido cross-origin é bloqueado pelo CORS (a origem
     * dele não está em {@code CORS_ALLOWED_ORIGINS}) e um formulário HTML simples
     * não consegue definir headers personalizados.</p>
     */
    @GetMapping("/csrf")
    public ResponseEntity<?> csrf(jakarta.servlet.http.HttpServletRequest request,
            HttpServletResponse response) {
        String token = jwtCookieService.getCsrfToken(request).orElse(null);
        if (token == null || token.isBlank()) {
            token = jwtCookieService.issueCsrfToken(response);
        }
        return ResponseEntity.ok(ApiResponse.data(Map.of("csrfToken", token)));
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest request,
            HttpServletResponse response, jakarta.servlet.http.HttpServletRequest httpRequest) {
        String clientIp = getClientIp(httpRequest);
        String userAgent = httpRequest.getHeader("User-Agent");
        AuthResponse authResponse = authService.register(request, response, false, clientIp, userAgent);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(authResponse));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request,
            HttpServletResponse response, jakarta.servlet.http.HttpServletRequest httpRequest) {
        // rememberMe pode vir no body ou ser fixo false por segurança
        boolean rememberMe = request.rememberMe() != null && request.rememberMe();
        String clientIp = getClientIp(httpRequest);
        String userAgent = httpRequest.getHeader("User-Agent");
        AuthResponse authResponse = authService.login(request, response, rememberMe, clientIp, userAgent);
        return ResponseEntity.ok(ApiResponse.data(authResponse));
    }

    /**
     * IP do cliente resolvido de forma segura: só confia em
     * {@code X-Forwarded-For}/{@code X-Real-IP} quando a ligação direta vem de um
     * proxy fidedigno, e usa o último elemento do XFF (o único acrescentado pelo
     * proxy). Alimenta o bloqueio por brute-force e os logs de auditoria.
     */
    private String getClientIp(jakarta.servlet.http.HttpServletRequest request) {
        return ClientIpResolver.resolve(request);
    }

    /**
     * Login social (público) — Google/Facebook. O token do fornecedor é validado
     * pelo backend antes de ligar ou criar a conta e emitir o JWT da loja.
     */
    @PostMapping("/social")
    public ResponseEntity<?> socialLogin(@Valid @RequestBody SocialLoginRequest request,
            HttpServletResponse response, jakarta.servlet.http.HttpServletRequest httpRequest) {
        String clientIp = getClientIp(httpRequest);
        String userAgent = httpRequest.getHeader("User-Agent");
        AuthResponse authResponse = authService.socialLogin(request, response, clientIp, userAgent);
        return ResponseEntity.ok(ApiResponse.data(authResponse));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(@AuthenticationPrincipal UserPrincipal principal) {
        UserDto profile = authService.getProfile(principal.id());
        return ResponseEntity.ok(ApiResponse.data(profile));
    }

    /** Atualiza a foto de perfil (autenticado). `avatar` vazio remove. */
    @PutMapping("/me/avatar")
    public ResponseEntity<?> updateAvatar(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody UpdateAvatarRequest request) {
        UserDto profile = authService.updateAvatar(principal.id(), request.avatar());
        return ResponseEntity.ok(ApiResponse.data(profile));
    }

    /**
     * Atualiza as preferências de notificação (autenticado). Campos null/ausentes
     * mantêm o valor atual.
     */
    @PatchMapping("/me/notification-prefs")
    public ResponseEntity<?> updateNotificationPrefs(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody NotificationPrefsRequest request) {
        UserDto profile = authService.updateNotificationPrefs(
                principal.id(),
                request.emailOffers(), request.emailNews(), request.emailOrder(),
                request.whatsappOffers(), request.whatsappOrder());
        return ResponseEntity.ok(ApiResponse.data(profile));
    }

    /** Atualização da foto de perfil — ver AuthDtos. */
    public record NotificationPrefsRequest(
            Boolean emailOffers,
            Boolean emailNews,
            Boolean emailOrder,
            Boolean whatsappOffers,
            Boolean whatsappOrder) {}

    /** Confirma o email com o token do link (público). */
    @PostMapping("/verify-email")
    public ResponseEntity<?> verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        return ResponseEntity.ok(ApiResponse.data(authService.verifyEmail(request.token())));
    }

    /**
     * Confirma o email com o código de 6 dígitos recebido no email (autenticado —
     * o utilizador cola-o na página de configurações da conta).
     */
    @PostMapping("/verify-email-code")
    public ResponseEntity<?> verifyEmailWithCode(@AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody VerifyEmailCodeRequest request) {
        return ResponseEntity.ok(ApiResponse.data(authService.verifyEmailWithCode(principal.id(), request.code())));
    }

    /** Reenvia o email de verificação (autenticado, conta não verificada). */
    @PostMapping("/resend-verification")
    public ResponseEntity<?> resendVerification(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.data(authService.resendVerification(principal.id())));
    }

    /** Termina a sessão em todos os dispositivos (autenticado). */
    @PostMapping("/logout")
    public ResponseEntity<?> logout(@AuthenticationPrincipal UserPrincipal principal,
            HttpServletResponse response, jakarta.servlet.http.HttpServletRequest httpRequest) {
        String clientIp = getClientIp(httpRequest);
        String userAgent = httpRequest.getHeader("User-Agent");
        authService.logout(principal.id(), principal.sessionId(), response, clientIp, userAgent);
        return ResponseEntity.ok(ApiResponse.data(Map.of(
                "message", "Sessão terminada em todos os dispositivos.")));
    }

    /**
     * Renova o access token usando refresh token do cookie HttpOnly (público).
     * Rotação: o refresh token antigo é revogado e um novo par é emitido.
     * O refresh token vem no cookie HttpOnly (nsm_rt).
     */
    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(HttpServletResponse response,
            jakarta.servlet.http.HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userAgent = request.getHeader("User-Agent");
        // O refresh token é lido do cookie pelo JwtCookieService no AuthService
        // Precisamos passar o refresh token do cookie para o service
        String refreshToken = request.getCookies() != null
                ? java.util.Arrays.stream(request.getCookies())
                        .filter(c -> "nsm_rt".equals(c.getName()))
                        .map(jakarta.servlet.http.Cookie::getValue)
                        .findFirst()
                        .orElse(null)
                : null;
        
        if (refreshToken == null) {
            return ResponseEntity.status(401).body(ApiResponse.error("Refresh token não encontrado no cookie"));
        }
        
        AuthResponse authResponse = authService.refreshToken(refreshToken, response, clientIp, userAgent);
        return ResponseEntity.ok(ApiResponse.data(authResponse));
    }

    /**
     * Revoga um refresh token específico (logout de um dispositivo).
     */
    @PostMapping("/revoke-refresh")
    public ResponseEntity<?> revokeRefresh(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody RefreshTokenRequest request) {
        authService.revokeRefreshToken(principal.id(), request.refreshToken());
        return ResponseEntity.ok(ApiResponse.data(Map.of(
                "message", "Sessão terminada neste dispositivo.")));
    }

    /**
     * Pedido de recuperação de palavra-passe (público). Resposta igual sempre,
     * para não revelar se o email está registado (anti-enumeração).
     */
    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        authService.requestPasswordReset(request.email());
        return ResponseEntity.ok(ApiResponse.data(Map.of(
                "message", "Se existir uma conta com este email, enviámos um link de recuperação.")));
    }

    /** Reposição de palavra-passe com o token do link (público). */
    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@Valid @RequestBody ResetPasswordRequest request,
            jakarta.servlet.http.HttpServletRequest httpRequest) {
        String clientIp = getClientIp(httpRequest);
        String userAgent = httpRequest.getHeader("User-Agent");
        authService.resetPassword(request.token(), request.password(), clientIp, userAgent);
        return ResponseEntity.ok(ApiResponse.data(Map.of(
                "message", "Palavra-passe atualizada com sucesso.")));
    }
}