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
import jakarta.servlet.http.HttpServletResponse;

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

    @Test
    void register_createsUserWithCustomerRole() {
        String email = "test-" + UUID.randomUUID() + "@example.com";
        AuthDtos.RegisterRequest request = new AuthDtos.RegisterRequest(
                "Test User",
                email,
                "Test@123",
                "+258840000000"
        );

        AuthDtos.AuthResponse response = authService.register(request, mock(HttpServletResponse.class), false, "127.0.0.1", "test-agent");

        assertThat(response.user().email()).isEqualTo(email);
        assertThat(response.user().fullName()).isEqualTo("Test User");
        assertThat(response.user().role()).isEqualTo("CUSTOMER");
        assertThat(response.token()).isNotBlank();
        assertThat(response.refreshToken()).isNotBlank();

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

        AuthDtos.AuthResponse response = authService.login(request, mock(HttpServletResponse.class), false, "127.0.0.1", "test-agent");

        assertThat(response.token()).isNotBlank();
        assertThat(response.refreshToken()).isNotBlank();
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