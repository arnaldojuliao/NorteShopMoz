package mz.norteshopmoz.api.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import mz.norteshopmoz.api.domain.UserAccount;

/** DTOs do fluxo de autenticação (registo/login/me). */
public final class AuthDtos {

    private AuthDtos() {}

    // Regex para validação de força da password:
    // - Mínimo 8 caracteres
    // - Pelo menos 1 maiúscula, 1 minúscula, 1 dígito, 1 caractere especial
    private static final String PASSWORD_PATTERN = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$";
    private static final String PASSWORD_MESSAGE = "Mínimo 8 caracteres: 1 maiúscula, 1 minúscula, 1 número, 1 símbolo (@$!%*?&)";

    public record RegisterRequest(
            @NotBlank(message = "Nome é obrigatório") @Size(max = 100, message = "Nome demasiado longo") String fullName,
            @NotBlank(message = "Email é obrigatório") @Email(message = "Email inválido") @Size(max = 255) String email,
            @NotBlank(message = "Palavra-passe é obrigatória")
            @Pattern(regexp = PASSWORD_PATTERN, message = PASSWORD_MESSAGE) String password,
            @Size(max = 20, message = "Telefone demasiado longo") String phone) {}

    public record LoginRequest(
            @NotBlank(message = "Email é obrigatório") @Email(message = "Email inválido") String email,
            @NotBlank(message = "Palavra-passe é obrigatória") String password,
            Boolean rememberMe) {}

    /**
     * Login social (Google/Facebook) — token emitido pelo fornecedor (ID token
     * do Google ou access token do Facebook), validado pelo backend junto do fornecedor.
     */
    public record SocialLoginRequest(
            @NotBlank(message = "Fornecedor é obrigatório") @Pattern(regexp = "^(google|facebook)$", message = "Fornecedor inválido") String provider,
            @NotBlank(message = "Token é obrigatório") String token) {}

    /** Atualização da foto de perfil (data URL de imagem). `avatar` vazio/null remove. */
    public record UpdateAvatarRequest(
            @Size(max = 2_000_000, message = "Imagem demasiado grande") String avatar) {}

    /** Confirmação de email via token recebido no link. */
    public record VerifyEmailRequest(
            @NotBlank(message = "Token é obrigatório") String token) {}

    /** Confirmação de email via código de 6 dígitos recebido no email. */
    public record VerifyEmailCodeRequest(
            @NotBlank(message = "Código é obrigatório")
            @Pattern(regexp = "\\d{6}", message = "O código tem 6 dígitos") String code) {}

    /** Pedido de recuperação de palavra-passe (público — não revela se a conta existe). */
    public record ForgotPasswordRequest(
            @NotBlank(message = "Email é obrigatório") @Email(message = "Email inválido") @Size(max = 255) String email) {}

    /** Reposição de palavra-passe com o token do link. */
    public record ResetPasswordRequest(
            @NotBlank(message = "Token é obrigatório") String token,
            @NotBlank(message = "Palavra-passe é obrigatória")
            @Pattern(regexp = PASSWORD_PATTERN, message = PASSWORD_MESSAGE) String password) {}

    /** Pedido de renovação de access token via refresh token (opcional — vem do cookie). */
    public record RefreshTokenRequest(
            String refreshToken) {}

    /**
     * Resposta de autenticação.
     *
     * <p><strong>Nunca transporta os tokens JWT.</strong> O access e o refresh
     * token viajam apenas em cookies HttpOnly — devolvê-los no corpo anulava o
     * propósito desses cookies: qualquer XSS, extensão ou registo de rede
     * passava a ter uma cópia do refresh token (que vive 30 dias).</p>
     *
     * <p>{@code csrfToken} vai no corpo de propósito: o cookie {@code nsm_csrf} é
     * legível por JavaScript apenas quando o frontend está no mesmo domínio do
     * cookie. Com a API num subdomínio, o frontend obtém o token daqui (ou de
     * {@code GET /api/auth/csrf}) em vez de o ler do cookie.</p>
     *
     * <p>{@code expiresInSeconds} é a validade do access token (para o frontend
     * agendar a renovação) — é um número, não um segredo.</p>
     */
    public record AuthResponse(UserDto user, String csrfToken, long expiresInSeconds) {}

    /** Preferências de notificação do utilizador (toggles em /configuracoes). */
    public record NotificationPrefsDto(
            boolean emailOffers,
            boolean emailNews,
            boolean emailOrder,
            boolean whatsappOffers,
            boolean whatsappOrder) {
        public static NotificationPrefsDto from(UserAccount user) {
            return new NotificationPrefsDto(
                    user.isNotifEmailOffers(),
                    user.isNotifEmailNews(),
                    user.isNotifEmailOrder(),
                    user.isNotifWhatsappOffers(),
                    user.isNotifWhatsappOrder());
        }
    }

    public record UserDto(String id, String email, String fullName, String phone, String role, String avatar,
            boolean emailVerified, String authProvider, NotificationPrefsDto notificationPrefs) {
        public static UserDto from(UserAccount user) {
            return new UserDto(user.getId(), user.getEmail(), user.getFullName(), user.getPhone(), user.getRole(),
                    user.getAvatar(), user.isEmailVerified(), user.getAuthProvider(),
                    NotificationPrefsDto.from(user));
        }
    }
}