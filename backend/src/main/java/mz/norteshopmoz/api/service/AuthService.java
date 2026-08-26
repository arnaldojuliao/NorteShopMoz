package mz.norteshopmoz.api.service;

import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import jakarta.servlet.http.HttpServletResponse;
import mz.norteshopmoz.api.config.AppProperties;
import mz.norteshopmoz.api.config.JwtCookieService;
import mz.norteshopmoz.api.domain.UserAccount;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.UserRepository;
import mz.norteshopmoz.api.security.AuditService;
import mz.norteshopmoz.api.security.JwtService;
import mz.norteshopmoz.api.security.LoginAttemptService;
import mz.norteshopmoz.api.security.RefreshTokenService;
import mz.norteshopmoz.api.security.SessionRevocationService;
import mz.norteshopmoz.api.web.dto.AuthDtos.AuthResponse;
import mz.norteshopmoz.api.web.dto.AuthDtos.LoginRequest;
import mz.norteshopmoz.api.web.dto.AuthDtos.RegisterRequest;
import mz.norteshopmoz.api.web.dto.AuthDtos.SocialLoginRequest;
import mz.norteshopmoz.api.web.dto.AuthDtos.UserDto;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Registo, login e perfil de utilizadores (JWT em cookies HttpOnly + CSRF). */
@Service
public class AuthService {

    /** Tamanho máximo da imagem descodificada (base64) — 512px WebP fica bem abaixo. */
    private static final int MAX_AVATAR_BYTES = 1_500_000;

    /** Validade do link de verificação de email. */
    private static final Duration VERIFICATION_TTL = Duration.ofHours(24);

    /** Validade do link de recuperação de palavra-passe. */
    private static final Duration RESET_TTL = Duration.ofHours(1);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;
    private final EmailService emailService;
    private final SessionRevocationService sessionRevocationService;
    private final SocialAuthService socialAuthService;
    private final AppProperties props;
    private final JwtCookieService jwtCookieService;
    private final LoginAttemptService loginAttemptService;
    private final AuditService auditService;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService,
            RefreshTokenService refreshTokenService,
            EmailService emailService, SessionRevocationService sessionRevocationService,
            SocialAuthService socialAuthService, AppProperties props, JwtCookieService jwtCookieService,
            LoginAttemptService loginAttemptService, AuditService auditService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
        this.emailService = emailService;
        this.sessionRevocationService = sessionRevocationService;
        this.socialAuthService = socialAuthService;
        this.props = props;
        this.jwtCookieService = jwtCookieService;
        this.loginAttemptService = loginAttemptService;
        this.auditService = auditService;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request, HttpServletResponse response, boolean rememberMe, String clientIp, String userAgent) {
        String email = request.email().trim().toLowerCase();
        if (userRepository.existsByEmailIgnoreCase(email)) {
            auditService.logAuthEvent(AuditService.AuthEvent.REGISTER, email, clientIp, userAgent, false, "Email already exists");
            throw ApiException.conflict("Já existe uma conta com este email");
        }
        UserAccount user = UserAccount.builder()
                .email(email)
                .fullName(request.fullName().trim())
                .phone(request.phone())
                .passwordHash(passwordEncoder.encode(request.password()))
                .createdAt(Instant.now())
                .role("CUSTOMER")
                .authProvider("EMAIL")
                .verificationToken(newVerificationToken())
                .verificationTokenExpiry(Instant.now().plus(VERIFICATION_TTL))
                .build();
        userRepository.save(user);
        emailService.sendVerification(user, verificationUrl(user.getVerificationToken()));
        String accessToken = jwtService.generateToken(user);
        String refreshToken = jwtService.generateRefreshToken(user);
        refreshTokenService.store(user.getId(), refreshToken);
        setAuthCookies(response, accessToken, refreshToken, rememberMe);
        auditService.logAuthEvent(AuditService.AuthEvent.REGISTER, email, clientIp, userAgent, true, "User registered");
        return new AuthResponse(accessToken, refreshToken, UserDto.from(user));
    }

    /** Confirma o email com o token do link. Login continua permitido sem verificação. */
    @Transactional
    public UserDto verifyEmail(String token) {
        if (token == null || token.isBlank()) {
            throw ApiException.badRequest("Link de verificação inválido");
        }
        UserAccount user = userRepository.findByVerificationToken(token)
                .orElseThrow(() -> ApiException.badRequest("Link de verificação inválido"));
        if (user.getVerificationTokenExpiry() == null
                || user.getVerificationTokenExpiry().isBefore(Instant.now())) {
            throw ApiException.badRequest("Link expirado — peça um novo email de verificação no perfil");
        }
        user.setEmailVerified(true);
        user.setVerificationToken(null);
        user.setVerificationTokenExpiry(null);
        userRepository.save(user);
        return UserDto.from(user);
    }

    /** Gera novo token e reenvia o email de verificação (conta não verificada). */
    @Transactional
    public UserDto resendVerification(String userId) {
        UserAccount user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("Utilizador não encontrado"));
        if (user.isEmailVerified()) {
            throw ApiException.conflict("O seu email já está verificado");
        }
        user.setVerificationToken(newVerificationToken());
        user.setVerificationTokenExpiry(Instant.now().plus(VERIFICATION_TTL));
        userRepository.save(user);
        emailService.sendVerification(user, verificationUrl(user.getVerificationToken()));
        return UserDto.from(user);
    }

    /** Termina a sessão em todos os dispositivos (revoga todos os tokens do utilizador). */
    public void logout(String userId, HttpServletResponse response, String clientIp, String userAgent) {
        sessionRevocationService.revokeAll(userId);
        refreshTokenService.revokeAll(userId);
        jwtCookieService.clearAuthCookies(response);
        auditService.logAuthEvent(AuditService.AuthEvent.LOGOUT, userId, clientIp, userAgent, true, "Logout all devices");
    }

    /**
     * Envia o link de recuperação de palavra-passe. Resposta idêntica com ou sem
     * conta (anti-enumeração): se o email não existir, nada é enviado.
     */
    @Transactional
    public void requestPasswordReset(String email) {
        userRepository.findByEmailIgnoreCase(email.trim().toLowerCase()).ifPresent(user -> {
            user.setResetToken(newVerificationToken());
            user.setResetTokenExpiry(Instant.now().plus(RESET_TTL));
            userRepository.save(user);
            emailService.sendPasswordReset(user, resetUrl(user.getResetToken()));
        });
    }

    /** Repõe a palavra-passe com o token do link (uso único, expira em 1 hora). */
    @Transactional
    public void resetPassword(String token, String newPassword, String clientIp, String userAgent) {
        if (token == null || token.isBlank()) {
            throw ApiException.badRequest("Link de recuperação inválido");
        }
        UserAccount user = userRepository.findByResetToken(token)
                .orElseThrow(() -> ApiException.badRequest("Link de recuperação inválido ou já utilizado"));
        if (user.getResetTokenExpiry() == null || user.getResetTokenExpiry().isBefore(Instant.now())) {
            throw ApiException.badRequest("Link expirado — peça um novo link de recuperação");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setResetToken(null);
        user.setResetTokenExpiry(null);
        userRepository.save(user);
        sessionRevocationService.revokeAll(user.getId());
        auditService.logAuthEvent(AuditService.AuthEvent.PASSWORD_RESET_SUCCESS, user.getEmail(), clientIp, userAgent, true, "Password reset via email link");
    }

    private static String newVerificationToken() {
        return UUID.randomUUID().toString();
    }

    private String verificationUrl(String token) {
        String base = props.mail().baseUrl().replaceAll("/+$", "");
        return base + "/verificar-email?token=" + token;
    }

    private String resetUrl(String token) {
        String base = props.mail().baseUrl().replaceAll("/+$", "");
        return base + "/recuperar-password?token=" + token;
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request, HttpServletResponse response, boolean rememberMe, String clientIp, String userAgent) {
        String email = request.email().trim().toLowerCase();
        
        // Verifica bloqueio por brute-force
        if (loginAttemptService.isBlocked(clientIp, email)) {
            long remainingSeconds = loginAttemptService.getLockoutRemainingSeconds(clientIp, email);
            auditService.logAuthEvent(AuditService.AuthEvent.ACCOUNT_LOCKED, email, clientIp, userAgent, false, "Account locked due to brute force");
            throw ApiException.tooManyRequests(
                    "Demasiadas tentativas falhadas. Tente novamente em " + (remainingSeconds / 60) + " minutos.");
        }
        
        UserAccount user = userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> {
                    loginAttemptService.recordFailure(clientIp, email);
                    auditService.logAuthEvent(AuditService.AuthEvent.LOGIN_FAILURE, email, clientIp, userAgent, false, "User not found");
                    return ApiException.unauthorized("Credenciais inválidas");
                });
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            loginAttemptService.recordFailure(clientIp, email);
            auditService.logAuthEvent(AuditService.AuthEvent.LOGIN_FAILURE, email, clientIp, userAgent, false, "Invalid password");
            throw ApiException.unauthorized("Credenciais inválidas");
        }
        
        // Login bem-sucedido — limpa contadores
        loginAttemptService.recordSuccess(clientIp, email);
        
        String accessToken = jwtService.generateToken(user);
        String refreshToken = jwtService.generateRefreshToken(user);
        refreshTokenService.store(user.getId(), refreshToken);
        setAuthCookies(response, accessToken, refreshToken, rememberMe);
        auditService.logAuthEvent(AuditService.AuthEvent.LOGIN_SUCCESS, email, clientIp, userAgent, true, "Login successful");
        return new AuthResponse(accessToken, refreshToken, UserDto.from(user));
    }

    /**
     * Login social (Google/Facebook): valida o token junto do fornecedor, liga à conta
     * existente pelo email ou cria uma nova (palavra-passe inutilizável, email já
     * verificado pelo fornecedor) e emite o JWT normal da loja.
     */
    @Transactional
    public AuthResponse socialLogin(SocialLoginRequest request, HttpServletResponse response, String clientIp, String userAgent) {
        SocialAuthService.SocialProfile profile = socialAuthService.verify(request.provider(), request.token());
        String email = profile.email().toLowerCase();
        UserAccount user = userRepository.findByEmailIgnoreCase(email).orElseGet(() -> {
            String name = profile.fullName() == null || profile.fullName().isBlank()
                    ? "Cliente NorteShop"
                    : profile.fullName().trim();
            UserAccount created = UserAccount.builder()
                    .email(email)
                    .fullName(name)
                    .avatar(profile.avatar())
                    .passwordHash(passwordEncoder.encode(UUID.randomUUID().toString()))
                    .createdAt(Instant.now())
                    .role("CUSTOMER")
                    .authProvider(profile.provider().toUpperCase())
                    .emailVerified(true)
                    .build();
            return userRepository.save(created);
        });
        if (user.getAvatar() == null && profile.avatar() != null) {
            user.setAvatar(profile.avatar());
        }
        if (!user.isEmailVerified()) {
            user.setEmailVerified(true);
            user.setVerificationToken(null);
            user.setVerificationTokenExpiry(null);
        }
        userRepository.save(user);
        String accessToken = jwtService.generateToken(user);
        String refreshToken = jwtService.generateRefreshToken(user);
        refreshTokenService.store(user.getId(), refreshToken);
        setAuthCookies(response, accessToken, refreshToken, false);
        auditService.logAuthEvent(AuditService.AuthEvent.SOCIAL_LOGIN, email, clientIp, userAgent, true, "Provider: " + request.provider());
        return new AuthResponse(accessToken, refreshToken, UserDto.from(user));
    }

    @Transactional(readOnly = true)
    public UserDto getProfile(String userId) {
        UserAccount user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("Utilizador não encontrado"));
        return UserDto.from(user);
    }

    /**
     * Atualiza a foto de perfil (data URL de imagem). `avatar` vazio/null remove a foto.
     * Devolve o perfil atualizado — incluído em /me, login e registo seguintes.
     */
    @Transactional
    public UserDto updateAvatar(String userId, String avatar) {
        UserAccount user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("Utilizador não encontrado"));
        user.setAvatar(validateAvatar(avatar));
        userRepository.save(user);
        return UserDto.from(user);
    }

    /**
     * Atualiza as preferências de notificação (email/WhatsApp). Campos null
     * mantêm o valor atual — o frontend envia apenas os toggles alterados ou
     * todos de uma vez.
     */
    @Transactional
    public UserDto updateNotificationPrefs(String userId,
            Boolean emailOffers, Boolean emailNews, Boolean emailOrder,
            Boolean whatsappOffers, Boolean whatsappOrder) {
        UserAccount user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("Utilizador não encontrado"));
        if (emailOffers != null) user.setNotifEmailOffers(emailOffers);
        if (emailNews != null) user.setNotifEmailNews(emailNews);
        if (emailOrder != null) user.setNotifEmailOrder(emailOrder);
        if (whatsappOffers != null) user.setNotifWhatsappOffers(whatsappOffers);
        if (whatsappOrder != null) user.setNotifWhatsappOrder(whatsappOrder);
        userRepository.save(user);
        return UserDto.from(user);
    }

    /** Valida a data URL da imagem e devolve-a; null/blank remove. */
    private String validateAvatar(String avatar) {
        if (avatar == null || avatar.isBlank()) return null;
        if (!avatar.startsWith("data:image/")) {
            throw ApiException.badRequest("Foto inválida — deve ser uma imagem (data URL)");
        }
        int comma = avatar.indexOf(',');
        if (comma <= 0 || comma >= avatar.length() - 1) {
            throw ApiException.badRequest("Foto inválida — dados da imagem em falta");
        }
        try {
            byte[] bytes = Base64.getDecoder().decode(avatar.substring(comma + 1));
            if (bytes.length > MAX_AVATAR_BYTES) {
                throw ApiException.badRequest("Imagem demasiado grande (máx. 1,5 MB)");
            }
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Foto inválida — base64 corrompido");
        }
        return avatar;
    }

    /**
     * Renova o access token usando um refresh token válido (rotação de tokens).
     * Remove o refresh token antigo e emite um novo par (access + refresh).
     */
    @Transactional
    public AuthResponse refreshToken(String refreshToken, HttpServletResponse response, String clientIp, String userAgent) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw ApiException.unauthorized("Refresh token em falta");
        }
        String userId;
        try {
            var claims = jwtService.parseClaims(refreshToken);
            if (!"refresh".equals(claims.get("typ"))) {
                throw ApiException.unauthorized("Token inválido — não é um refresh token");
            }
            userId = claims.get("uid", String.class);
        } catch (Exception e) {
            auditService.logAuthEvent(AuditService.AuthEvent.TOKEN_REFRESH, "unknown", clientIp, userAgent, false, "Invalid refresh token");
            throw ApiException.unauthorized("Refresh token inválido ou expirado");
        }
        if (userId == null || !refreshTokenService.isValid(userId, refreshToken)) {
            auditService.logAuthEvent(AuditService.AuthEvent.TOKEN_REFRESH, userId, clientIp, userAgent, false, "Revoked or non-existent refresh token");
            throw ApiException.unauthorized("Refresh token revogado ou inexistente");
        }
        UserAccount user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("Utilizador não encontrado"));
        String newAccessToken = jwtService.generateToken(user);
        String newRefreshToken = jwtService.generateRefreshToken(user);
        refreshTokenService.rotate(userId, refreshToken, newRefreshToken);
        // rememberMe=false para refresh — o cookie de sessão mantém o access token
        jwtCookieService.setAccessToken(response, newAccessToken, false);
        jwtCookieService.setRefreshToken(response, newRefreshToken);
        // Novo CSRF token na rotação
        String csrfToken = generateCsrfToken();
        jwtCookieService.setCsrfToken(response, csrfToken);
        auditService.logAuthEvent(AuditService.AuthEvent.TOKEN_REFRESH, user.getEmail(), clientIp, userAgent, true, "Token rotated");
        return new AuthResponse(newAccessToken, newRefreshToken, UserDto.from(user));
    }

    /**
     * Revoga um refresh token específico (logout de um dispositivo).
     */
    @Transactional
    public void revokeRefreshToken(String userId, String refreshToken) {
        refreshTokenService.revoke(userId, refreshToken);
    }

    /** Define cookies de autenticação + CSRF token. */
    private void setAuthCookies(HttpServletResponse response, String accessToken, String refreshToken, boolean rememberMe) {
        jwtCookieService.setAccessToken(response, accessToken, rememberMe);
        jwtCookieService.setRefreshToken(response, refreshToken);
        String csrfToken = generateCsrfToken();
        jwtCookieService.setCsrfToken(response, csrfToken);
    }

    /** Gera CSRF token aleatório (32 bytes hex). */
    private String generateCsrfToken() {
        return UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "");
    }
}