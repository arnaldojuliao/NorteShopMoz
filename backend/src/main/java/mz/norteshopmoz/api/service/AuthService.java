package mz.norteshopmoz.api.service;

import java.security.SecureRandom;
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
import mz.norteshopmoz.api.security.SessionIdleService;
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

    /** Validade do link e do código de verificação de email. */
    private static final Duration VERIFICATION_TTL = Duration.ofHours(24);

    /**
     * Tentativas falhadas com o código antes de o invalidar. São 1M de combinações
     * e a janela de validade é longa — sem limite, a força bruta era viável.
     */
    private static final int MAX_CODE_ATTEMPTS = 5;

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

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
    private final SessionIdleService sessionIdleService;
    private final AuditService auditService;
    private final EmailThrottleService emailThrottle;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService,
            RefreshTokenService refreshTokenService,
            EmailService emailService, SessionRevocationService sessionRevocationService,
            SocialAuthService socialAuthService, AppProperties props, JwtCookieService jwtCookieService,
            LoginAttemptService loginAttemptService, SessionIdleService sessionIdleService,
            AuditService auditService, EmailThrottleService emailThrottle) {
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
        this.sessionIdleService = sessionIdleService;
        this.auditService = auditService;
        this.emailThrottle = emailThrottle;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request, HttpServletResponse response, boolean rememberMe, String clientIp, String userAgent) {
        String email = request.email().trim().toLowerCase();
        if (userRepository.existsByEmailIgnoreCase(email)) {
            auditService.logAuthEvent(AuditService.AuthEvent.REGISTER, email, clientIp, userAgent, false, "Email already exists");
            throw ApiException.conflict("Já existe uma conta com este email");
        }
        // Travão dos emails públicos: o endereço vem do PEDIDO, não de uma conta —
        // sem isto, um script com uma lista de endereços queima a cota do
        // fornecedor de email (e os clientes reais deixam de receber a confirmação
        // do pedido) e suja a reputação do domínio. Ver EmailThrottleService.
        emailThrottle.assertAllowed(email);
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
                .verificationCode(newVerificationCode())
                .build();
        userRepository.save(user);
        emailService.sendVerification(user, verificationUrl(user.getVerificationToken()), user.getVerificationCode());
        emailThrottle.recordSent(email);
        // Sessão com id próprio (sid): a partir daqui o SERVIDOR mede a
        // inatividade desta sessão (ver SessionIdleService).
        IssuedSession session = issueSession(user);
        String accessToken = session.accessToken();
        String refreshToken = session.refreshToken();
        String csrfToken = setAuthCookies(response, accessToken, refreshToken, rememberMe);
        auditService.logAuthEvent(AuditService.AuthEvent.REGISTER, email, clientIp, userAgent, true, "User registered");
        return new AuthResponse(UserDto.from(user), csrfToken, accessTokenExpiresInSeconds());
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
        markVerified(user);
        return UserDto.from(user);
    }

    /**
     * Confirma o email com o **código de 6 dígitos** do email — alternativa ao
     * link (o utilizador cola-o na página de configurações da conta).
     *
     * <p>Só a própria conta pode usar o seu código (endpoint autenticado) e cada
     * erro consome uma tentativa: ao fim de {@value #MAX_CODE_ATTEMPTS} o código é
     * invalidado e é preciso pedir um novo.
     *
     * <p>{@code noRollbackFor}: o contador de tentativas é gravado **antes** de
     * lançar o erro; sem isto, o rollback da transação (ApiException é uma
     * RuntimeException) descartava o incremento e a tentativa nunca contava.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public UserDto verifyEmailWithCode(String userId, String code) {
        UserAccount user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("Utilizador não encontrado"));
        if (user.isEmailVerified()) {
            throw ApiException.conflict("O seu email já está verificado");
        }
        String expected = user.getVerificationCode();
        if (expected == null
                || user.getVerificationTokenExpiry() == null
                || user.getVerificationTokenExpiry().isBefore(Instant.now())) {
            throw ApiException.badRequest("Código expirado — peça um novo código de verificação");
        }
        if (!expected.equals(code == null ? "" : code.trim())) {
            int attempts = user.getVerificationCodeAttempts() + 1;
            if (attempts >= MAX_CODE_ATTEMPTS) {
                // Invalida link e código: obriga a pedir um novo (não fica a janela
                // aberta a tentativas ilimitadas dentro das 24 horas).
                user.setVerificationCode(null);
                user.setVerificationToken(null);
                user.setVerificationTokenExpiry(null);
                user.setVerificationCodeAttempts(0);
                userRepository.save(user);
                throw ApiException.badRequest("Demasiadas tentativas — peça um novo código de verificação");
            }
            user.setVerificationCodeAttempts(attempts);
            userRepository.save(user);
            throw ApiException.badRequest("Código incorreto. Confirme os 6 dígitos e tente novamente.");
        }
        markVerified(user);
        return UserDto.from(user);
    }

    /** Gera novo token/código e reenvia o email de verificação (conta não verificada). */
    @Transactional
    public UserDto resendVerification(String userId) {
        UserAccount user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("Utilizador não encontrado"));
        if (user.isEmailVerified()) {
            throw ApiException.conflict("O seu email já está verificado");
        }
        user.setVerificationToken(newVerificationToken());
        user.setVerificationTokenExpiry(Instant.now().plus(VERIFICATION_TTL));
        user.setVerificationCode(newVerificationCode());
        user.setVerificationCodeAttempts(0);
        userRepository.save(user);
        // Mesmo sendo a própria conta, o envio passa pelo travão: é ele que impede
        // que cliques repetidos (ou um script com a sessão roubada) consumam a cota.
        emailThrottle.assertAllowed(user.getEmail());
        emailService.sendVerification(user, verificationUrl(user.getVerificationToken()), user.getVerificationCode());
        emailThrottle.recordSent(user.getEmail());
        return UserDto.from(user);
    }

    /** Marca o email como confirmado e consome o token, o código e as tentativas. */
    private void markVerified(UserAccount user) {
        user.setEmailVerified(true);
        user.setVerificationToken(null);
        user.setVerificationTokenExpiry(null);
        user.setVerificationCode(null);
        user.setVerificationCodeAttempts(0);
        userRepository.save(user);
    }

    /**
     * Termina a sessão em todos os dispositivos (revoga todos os tokens do
     * utilizador) e apaga a janela de inatividade deste dispositivo.
     *
     * @param sessionId {@code sid} da sessão atual (vem do principal), pode ser
     *                  {@code null} em tokens sem sessão
     */
    public void logout(String userId, String sessionId, HttpServletResponse response,
            String clientIp, String userAgent) {
        sessionRevocationService.revokeAll(userId);
        refreshTokenService.revokeAll(userId);
        sessionIdleService.end(sessionId);
        jwtCookieService.clearAuthCookies(response);
        auditService.logAuthEvent(AuditService.AuthEvent.LOGOUT, userId, clientIp, userAgent, true, "Logout all devices");
    }

    /**
     * Envia o link de recuperação de palavra-passe. Resposta idêntica com ou sem
     * conta (anti-enumeração): se o email não existir, nada é enviado.
     */
    @Transactional
    public void requestPasswordReset(String email) {
        // O travão é verificado ANTES de tocar na base de dados e não revela se a
        // conta existe (a resposta é idêntica nos dois casos, como antes) — apenas
        // impede que a mesma caixa de correio (ou a loja inteira) seja bombardeada.
        emailThrottle.assertAllowed(email);
        userRepository.findByEmailIgnoreCase(email.trim().toLowerCase()).ifPresent(user -> {
            user.setResetToken(newVerificationToken());
            user.setResetTokenExpiry(Instant.now().plus(RESET_TTL));
            userRepository.save(user);
            emailService.sendPasswordReset(user, resetUrl(user.getResetToken()));
            emailThrottle.recordSent(user.getEmail());
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

    /** Código numérico de 6 dígitos (com zeros à esquerda), criptograficamente seguro. */
    private static String newVerificationCode() {
        return String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
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
        
        // Sessão com id próprio (sid): a partir daqui o SERVIDOR mede a
        // inatividade desta sessão (ver SessionIdleService).
        IssuedSession session = issueSession(user);
        String accessToken = session.accessToken();
        String refreshToken = session.refreshToken();
        String csrfToken = setAuthCookies(response, accessToken, refreshToken, rememberMe);
        auditService.logAuthEvent(AuditService.AuthEvent.LOGIN_SUCCESS, email, clientIp, userAgent, true, "Login successful");
        return new AuthResponse(UserDto.from(user), csrfToken, accessTokenExpiresInSeconds());
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
                    ? "Cliente NorteShopMoz"
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
        // Sessão com id próprio (sid): a partir daqui o SERVIDOR mede a
        // inatividade desta sessão (ver SessionIdleService).
        IssuedSession session = issueSession(user);
        String accessToken = session.accessToken();
        String refreshToken = session.refreshToken();
        String csrfToken = setAuthCookies(response, accessToken, refreshToken, false);
        auditService.logAuthEvent(AuditService.AuthEvent.SOCIAL_LOGIN, email, clientIp, userAgent, true, "Provider: " + request.provider());
        return new AuthResponse(UserDto.from(user), csrfToken, accessTokenExpiresInSeconds());
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
        String sessionId;
        try {
            var claims = jwtService.parseClaims(refreshToken);
            if (!"refresh".equals(claims.get("typ"))) {
                throw ApiException.unauthorized("Token inválido — não é um refresh token");
            }
            userId = claims.get("uid", String.class);
            sessionId = claims.get("sid", String.class);
        } catch (Exception e) {
            auditService.logAuthEvent(AuditService.AuthEvent.TOKEN_REFRESH, "unknown", clientIp, userAgent, false, "Invalid refresh token");
            throw ApiException.unauthorized("Refresh token inválido ou expirado");
        }
        if (userId == null || !refreshTokenService.isValid(userId, refreshToken)) {
            auditService.logAuthEvent(AuditService.AuthEvent.TOKEN_REFRESH, userId, clientIp, userAgent, false, "Revoked or non-existent refresh token");
            throw ApiException.unauthorized("Refresh token revogado ou inexistente");
        }
        // Inatividade: o refresh token vive 30 dias, mas não pode reviver uma
        // sessão que ficou ociosa. Sem esta verificação, o idle timeout do
        // servidor contornava-se com um simples refresh.
        if (sessionIdleService.isExpired(sessionId)) {
            refreshTokenService.revoke(userId, refreshToken);
            auditService.logAuthEvent(AuditService.AuthEvent.TOKEN_REFRESH, userId, clientIp, userAgent, false, "Session idle timeout");
            throw ApiException.unauthorized("Sessão expirada por inatividade — inicie sessão novamente");
        }
        UserAccount user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("Utilizador não encontrado"));
        // Mantém o mesmo sid: a sessão (e a sua janela de inatividade) continua.
        String newAccessToken = jwtService.generateToken(user, sessionId);
        String newRefreshToken = jwtService.generateRefreshToken(user, sessionId);
        sessionIdleService.touch(sessionId);
        refreshTokenService.rotate(userId, refreshToken, newRefreshToken);
        // rememberMe=false para refresh — o cookie de sessão mantém o access token
        jwtCookieService.setAccessToken(response, newAccessToken, false);
        jwtCookieService.setRefreshToken(response, newRefreshToken);
        // Novo CSRF token na rotação (também vai no corpo — ver AuthResponse).
        String csrfToken = jwtCookieService.issueCsrfToken(response);
        auditService.logAuthEvent(AuditService.AuthEvent.TOKEN_REFRESH, user.getEmail(), clientIp, userAgent, true, "Token rotated");
        return new AuthResponse(UserDto.from(user), csrfToken, accessTokenExpiresInSeconds());
    }

    /**
     * Revoga um refresh token específico (logout de um dispositivo).
     */
    @Transactional
    public void revokeRefreshToken(String userId, String refreshToken) {
        refreshTokenService.revoke(userId, refreshToken);
    }

    /** Par de tokens de uma sessão nova, com o respectivo id. */
    private record IssuedSession(String accessToken, String refreshToken, String sessionId) {}

    /**
     * Abre uma sessão: cria o {@code sid}, regista-o para o controlo de
     * inatividade e emite o par de tokens com esse {@code sid}.
     */
    private IssuedSession issueSession(UserAccount user) {
        String sessionId = UUID.randomUUID().toString();
        sessionIdleService.start(sessionId);
        String accessToken = jwtService.generateToken(user, sessionId);
        String refreshToken = jwtService.generateRefreshToken(user, sessionId);
        refreshTokenService.store(user.getId(), refreshToken);
        return new IssuedSession(accessToken, refreshToken, sessionId);
    }

    /**
     * Define cookies de autenticação + CSRF token e devolve o token CSRF, para
     * ser incluído no corpo da resposta (o frontend pode estar noutro domínio,
     * onde o cookie não é legível por JavaScript).
     */
    private String setAuthCookies(HttpServletResponse response, String accessToken, String refreshToken,
            boolean rememberMe) {
        jwtCookieService.setAccessToken(response, accessToken, rememberMe);
        jwtCookieService.setRefreshToken(response, refreshToken);
        return jwtCookieService.issueCsrfToken(response);
    }

    /**
     * Validade do access token, em segundos, para o frontend agendar a renovação.
     * É apenas um número — os tokens em si nunca saem no corpo (ver AuthResponse).
     */
    private long accessTokenExpiresInSeconds() {
        return props.jwt().expiration().toSeconds();
    }
}