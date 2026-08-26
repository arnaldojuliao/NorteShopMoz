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

    public record AuthResponse(String token, String refreshToken, UserDto user) {}

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