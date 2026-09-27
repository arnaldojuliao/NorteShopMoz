package mz.norteshopmoz.api.service;

import mz.norteshopmoz.api.domain.UserAccount;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.UserRepository;
import mz.norteshopmoz.api.web.dto.AuthDtos;
import mz.norteshopmoz.api.web.dto.AuthDtos.AuthResponse;
import mz.norteshopmoz.api.web.dto.AuthDtos.RegisterRequest;
import mz.norteshopmoz.api.web.dto.AuthDtos.LoginRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.mock.web.MockHttpServletResponse;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;

import java.util.Arrays;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

@SpringBootTest
@ActiveProfiles("unit-test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AuthServiceTest {

    @Autowired
    AuthService authService;

    @Autowired
    UserRepository userRepository;

    @Autowired
    PasswordEncoder passwordEncoder;

    private HttpServletResponse mockResponse() {
        return mock(HttpServletResponse.class);
    }

    /** Valor de um cookie definido na resposta (null se ausente). */
    private static String cookie(MockHttpServletResponse response, String name) {
        Cookie c = response.getCookie(name);
        return c == null ? null : c.getValue();
    }

    /**
     * Os tokens NUNCA podem voltar no corpo da resposta: só em cookies HttpOnly.
     * Devollvê-los em JSON anulava o propósito do HttpOnly — qualquer XSS ou
     * registo de rede passava a ter uma cópia do refresh token (30 dias).
     */
    @Test
    void authResponseNaoExpoeTokensNoCorpo() {
        assertThat(Arrays.stream(AuthResponse.class.getRecordComponents())
                .map(rc -> rc.getName().toLowerCase()))
                .doesNotContain("token", "refreshtoken", "accesstoken", "jwt");
    }

    @Test
    void register_createsUserWithCustomerRole() {
        String email = "test-" + UUID.randomUUID() + "@example.com";
        AuthDtos.RegisterRequest request = new AuthDtos.RegisterRequest(
                "Test User",
                email,
                "Test@123",
                "+258840000000"
        );

        MockHttpServletResponse httpResponse = new MockHttpServletResponse();
        AuthDtos.AuthResponse response = authService.register(request, httpResponse, false, "127.0.0.1", "test-agent");

        assertThat(response.user().email()).isEqualTo(email);
        assertThat(response.user().fullName()).isEqualTo("Test User");
        assertThat(response.user().role()).isEqualTo("CUSTOMER");
        // Os tokens viajam em cookies HttpOnly, nunca no corpo.
        assertThat(cookie(httpResponse, "nsm_at")).isNotBlank();
        assertThat(cookie(httpResponse, "nsm_rt")).isNotBlank();
        assertThat(response.expiresInSeconds()).isPositive();

        UserAccount saved = userRepository.findByEmailIgnoreCase(email).orElseThrow();
        assertThat(saved.getRole()).isEqualTo("CUSTOMER");
        assertThat(saved.getAuthProvider()).isEqualTo("EMAIL");
    }

    @Test
    void register_duplicateEmail_throwsConflict() {
        String email = "existing-" + UUID.randomUUID() + "@example.com";
        UserAccount existing = UserAccount.builder()
                .email(email)
                .fullName("Existing")
                .passwordHash(passwordEncoder.encode("Pass@123"))
                .role("CUSTOMER")
                .authProvider("EMAIL")
                .build();
        userRepository.save(existing);

        AuthDtos.RegisterRequest request = new AuthDtos.RegisterRequest(
                "New User",
                email,
                "Test@123",
                null
        );

        assertThatThrownBy(() -> authService.register(request, mock(HttpServletResponse.class), false, "127.0.0.1", "test-agent"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Já existe uma conta com este email");
    }

    @Test
    void login_validCredentials_returnsTokens() {
        String email = "login-" + UUID.randomUUID() + "@example.com";
        UserAccount user = UserAccount.builder()
                .email(email)
                .fullName("Login User")
                .passwordHash(passwordEncoder.encode("Login@123"))
                .role("CUSTOMER")
                .authProvider("EMAIL")
                .build();
        userRepository.save(user);

        AuthDtos.LoginRequest request = new AuthDtos.LoginRequest(email, "Login@123", false);

        MockHttpServletResponse httpResponse = new MockHttpServletResponse();
        AuthDtos.AuthResponse response = authService.login(request, httpResponse, false, "127.0.0.1", "test-agent");

        assertThat(cookie(httpResponse, "nsm_at")).isNotBlank();
        assertThat(cookie(httpResponse, "nsm_rt")).isNotBlank();
        assertThat(response.expiresInSeconds()).isPositive();
        assertThat(response.user().email()).isEqualTo(email);
    }

    @Test
    void login_invalidPassword_throwsUnauthorized() {
        String email = "badpass-" + UUID.randomUUID() + "@example.com";
        UserAccount user = UserAccount.builder()
                .email(email)
                .fullName("Bad Pass")
                .passwordHash(passwordEncoder.encode("Correct@123"))
                .role("CUSTOMER")
                .authProvider("EMAIL")
                .build();
        userRepository.save(user);

        AuthDtos.LoginRequest request = new AuthDtos.LoginRequest(email, "Wrong@123", false);

        assertThatThrownBy(() -> authService.login(request, mock(HttpServletResponse.class), false, "127.0.0.1", "test-agent"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Credenciais inválidas");
    }

    @Test
    void login_nonexistentUser_throwsUnauthorized() {
        String email = "nonexistent-" + UUID.randomUUID() + "@example.com";
        AuthDtos.LoginRequest request = new AuthDtos.LoginRequest(email, "Pass@123", false);

        assertThatThrownBy(() -> authService.login(request, mock(HttpServletResponse.class), false, "127.0.0.1", "test-agent"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Credenciais inválidas");
    }

    /* ── Verificação de email por código (modal em /configuracoes) ────── */

    /** Regista um utilizador e devolve a conta gravada (com token e código). */
    private UserAccount registerAndFetch(String prefix) {
        String email = prefix + "-" + UUID.randomUUID() + "@example.com";
        authService.register(new AuthDtos.RegisterRequest("Code User", email, "Test@123", null),
                mockResponse(), false, "127.0.0.1", "test-agent");
        return userRepository.findByEmailIgnoreCase(email).orElseThrow();
    }

    /** Código diferente do real (evita flakiness quando o real é "000000"). */
    private static String otherCode(String realCode) {
        return "000000".equals(realCode) ? "111111" : "000000";
    }

    @Test
    void register_generatesSixDigitVerificationCode() {
        UserAccount saved = registerAndFetch("codegen");

        assertThat(saved.getVerificationCode()).matches("\\d{6}");
        assertThat(saved.getVerificationCodeAttempts()).isZero();
        assertThat(saved.isEmailVerified()).isFalse();
        assertThat(saved.getVerificationToken()).isNotBlank();
    }

    @Test
    void verifyEmailWithCode_correctCode_marksVerifiedAndConsumesCode() {
        UserAccount saved = registerAndFetch("codeok");

        AuthDtos.UserDto dto = authService.verifyEmailWithCode(saved.getId(), saved.getVerificationCode());

        assertThat(dto.emailVerified()).isTrue();
        UserAccount after = userRepository.findById(saved.getId()).orElseThrow();
        assertThat(after.isEmailVerified()).isTrue();
        assertThat(after.getVerificationCode()).isNull();
        assertThat(after.getVerificationToken()).isNull();
        assertThat(after.getVerificationTokenExpiry()).isNull();
    }

    @Test
    void verifyEmailWithCode_wrongCode_failsAndCountsAttempt() {
        UserAccount saved = registerAndFetch("codebad");

        assertThatThrownBy(() -> authService.verifyEmailWithCode(saved.getId(), otherCode(saved.getVerificationCode())))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Código incorreto");

        UserAccount after = userRepository.findById(saved.getId()).orElseThrow();
        assertThat(after.isEmailVerified()).isFalse();
        assertThat(after.getVerificationCodeAttempts()).isEqualTo(1);
    }

    @Test
    void verifyEmailWithCode_fiveWrongAttempts_invalidateCode() {
        UserAccount saved = registerAndFetch("codelock");
        String wrong = otherCode(saved.getVerificationCode());

        // 4 tentativas erradas: continuam a ser "código incorreto".
        for (int i = 0; i < 4; i++) {
            assertThatThrownBy(() -> authService.verifyEmailWithCode(saved.getId(), wrong))
                    .isInstanceOf(ApiException.class)
                    .hasMessageContaining("Código incorreto");
        }
        // 5.ª tentativa: o código é invalidado (obriga a pedir um novo).
        assertThatThrownBy(() -> authService.verifyEmailWithCode(saved.getId(), wrong))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Demasiadas tentativas");

        UserAccount after = userRepository.findById(saved.getId()).orElseThrow();
        assertThat(after.getVerificationCode()).isNull();
        assertThat(after.isEmailVerified()).isFalse();
        // Sem código → já nem aceita o código antigo (que era o certo).
        assertThatThrownBy(() -> authService.verifyEmailWithCode(saved.getId(), "123456"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Código expirado");
    }

    @Test
    void resendVerification_rotatesCode() {
        UserAccount saved = registerAndFetch("coderesend");
        String before = saved.getVerificationCode();

        authService.resendVerification(saved.getId());

        UserAccount after = userRepository.findById(saved.getId()).orElseThrow();
        assertThat(after.getVerificationCode()).matches("\\d{6}");
        assertThat(after.getVerificationCodeAttempts()).isZero();
        // 1 em 1M de hipóteses de sair o mesmo — se sair, o teste é que está mal.
        assertThat(after.getVerificationCode()).isNotEqualTo(before);
    }

    @Test
    void getProfile_existingUser_returnsProfile() {
        String email = "profile-" + UUID.randomUUID() + "@example.com";
        UserAccount user = UserAccount.builder()
                .email(email)
                .fullName("Profile User")
                .passwordHash(passwordEncoder.encode("Pass@123"))
                .role("CUSTOMER")
                .authProvider("EMAIL")
                .phone("+258840000001")
                .build();
        UserAccount saved = userRepository.save(user);

        AuthDtos.UserDto profile = authService.getProfile(saved.getId());

        assertThat(profile.id()).isEqualTo(saved.getId());
        assertThat(profile.email()).isEqualTo(email);
        assertThat(profile.fullName()).isEqualTo("Profile User");
        assertThat(profile.phone()).isEqualTo("+258840000001");
    }
}