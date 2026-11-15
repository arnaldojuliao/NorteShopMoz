package mz.norteshopmoz.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import mz.norteshopmoz.api.domain.UserAccount;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

// Sem @DirtiesContext: com H2 partilhado (jdbc:h2:mem:testdb + create-drop),
// fechar o contexto entre métodos apagava o schema usado por outros contextos
// em cache ("Table categories not found"). Os utilizadores têm email UUID e os
// mocks @MockitoBean fazem reset entre métodos — cada teste é independente.
@SpringBootTest
@ActiveProfiles("unit-test")
class AuthServiceAvatarTest {

    private static final String CLOUDINARY_URL =
            "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_400/norteshopmoz/avatars/avatar.webp";

    @Autowired
    AuthService authService;

    @Autowired
    UserRepository userRepository;

    @Autowired
    PasswordEncoder passwordEncoder;

    @MockitoBean
    CloudinaryService cloudinaryService;

    private String userId;

    @BeforeEach
    void criarUtilizador() {
        UserAccount user = UserAccount.builder()
                .email("avatar-" + UUID.randomUUID() + "@example.com")
                .fullName("Cliente Avatar")
                .passwordHash(passwordEncoder.encode("password-123"))
                .createdAt(Instant.now())
                .role("CUSTOMER")
                .build();
        userId = userRepository.save(user).getId();
    }

    /** data URL com bytes pequenos (1 KB) para os testes felizes. */
    private static String dataUrl() {
        byte[] bytes = new byte[1024];
        return "data:image/webp;base64," + Base64.getEncoder().encodeToString(bytes);
    }

    @Test
    void guardaApenasOLinkDaCloudinaryNaBaseDeDados() {
        when(cloudinaryService.isConfigured()).thenReturn(true);
        when(cloudinaryService.uploadAvatar(any(), anyString())).thenReturn(CLOUDINARY_URL);

        String avatar = authService.updateAvatar(userId, dataUrl()).avatar();

        assertThat(avatar).isEqualTo(CLOUDINARY_URL);
        assertThat(avatar).startsWith("https://");
        assertThat(avatar).doesNotStartWith("data:");
        assertThat(userRepository.findById(userId).orElseThrow().getAvatar()).isEqualTo(CLOUDINARY_URL);
    }

    @Test
    void semCloudinaryConfiguradoRejeitaComMensagemClara() {
        assertThatThrownBy(() -> authService.updateAvatar(userId, dataUrl()))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Cloudinary");
        verify(cloudinaryService, never()).uploadAvatar(any(), anyString());
        assertThat(userRepository.findById(userId).orElseThrow().getAvatar()).isNull();
    }

    @Test
    void imagemGrandeDemaisRejeitaAntesDeEnviar() {
        when(cloudinaryService.isConfigured()).thenReturn(true);
        byte[] bytes = new byte[1_500_001];
        String grande = "data:image/png;base64," + Base64.getEncoder().encodeToString(bytes);

        assertThatThrownBy(() -> authService.updateAvatar(userId, grande))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("demasiado grande");
        verify(cloudinaryService, never()).uploadAvatar(any(), anyString());
    }

    @Test
    void formatoNaoImagemRejeita() {
        String pdf = "data:application/pdf;base64," + Base64.getEncoder().encodeToString(new byte[10]);

        assertThatThrownBy(() -> authService.updateAvatar(userId, pdf))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("deve ser uma imagem");
    }

    @Test
    void base64CorrompidoRejeita() {
        assertThatThrownBy(() -> authService.updateAvatar(userId, "data:image/png;base64,@@@"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("base64 corrompido");
    }

    @Test
    void valorVazioRemoveAFoto() {
        when(cloudinaryService.isConfigured()).thenReturn(true);
        when(cloudinaryService.uploadAvatar(any(), anyString())).thenReturn(CLOUDINARY_URL);
        authService.updateAvatar(userId, dataUrl());

        String avatar = authService.updateAvatar(userId, " ").avatar();

        assertThat(avatar).isNull();
        assertThat(userRepository.findById(userId).orElseThrow().getAvatar()).isNull();
    }
}
