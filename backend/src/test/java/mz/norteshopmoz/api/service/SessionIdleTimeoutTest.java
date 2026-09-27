package mz.norteshopmoz.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.servlet.http.Cookie;
import java.util.UUID;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.security.JwtService;
import mz.norteshopmoz.api.security.SessionIdleService;
import mz.norteshopmoz.api.web.dto.AuthDtos;
import mz.norteshopmoz.api.web.dto.AuthDtos.AuthResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;

/**
 * Idle timeout de sessão ponta a ponta (com Redis real, que no perfil de testes
 * é o Redis do docker-compose, porta 6381).
 *
 * <p>Antes: o "timeout de 30 minutos" só existia no cliente — o cookie do access
 * token era válido 7 dias e o {@code /api/auth/refresh} (30 dias) renovava a
 * sessão indefinidamente. Agora a janela é imposta no servidor, e o refresh
 * também a respeita.</p>
 *
 * <p>Os tokens são lidos dos <strong>cookies HttpOnly</strong> da resposta — o
 * corpo do {@link AuthResponse} já não os transporta (ver AuthServiceTest).</p>
 */
@SpringBootTest
@ActiveProfiles("unit-test")
class SessionIdleTimeoutTest {

    @Autowired
    AuthService authService;

    @Autowired
    JwtService jwtService;

    @Autowired
    SessionIdleService sessionIdleService;

    /** Sessão recém-criada: a resposta HTTP (com os cookies) e o corpo. */
    private record Session(AuthResponse auth, MockHttpServletResponse response) {}

    private static String cookie(MockHttpServletResponse response, String name) {
        Cookie c = response.getCookie(name);
        return c == null ? null : c.getValue();
    }

    private Session register() {
        String email = "idle-" + UUID.randomUUID() + "@example.com";
        MockHttpServletResponse response = new MockHttpServletResponse();
        AuthResponse auth = authService.register(
                new AuthDtos.RegisterRequest("Idle Teste", email, "Test@123", "+258840000000"),
                response, true, "127.0.0.1", "test-agent");
        return new Session(auth, response);
    }

    @Test
    void osDoisTokensPartilhamOMesmoSid() {
        Session session = register();

        String accessSid = jwtService.parseClaims(cookie(session.response(), "nsm_at")).get("sid", String.class);
        String refreshSid = jwtService.parseClaims(cookie(session.response(), "nsm_rt")).get("sid", String.class);

        assertThat(accessSid).isNotBlank();
        assertThat(refreshSid).isEqualTo(accessSid);
    }

    @Test
    void refreshEhPermitidoEnquantoASessaoEstiverAtiva() {
        Session session = register();
        String refreshToken = cookie(session.response(), "nsm_rt");
        MockHttpServletResponse rotatedResponse = new MockHttpServletResponse();

        AuthResponse rotated = authService.refreshToken(
                refreshToken, rotatedResponse, "127.0.0.1", "test-agent");

        assertThat(rotated.expiresInSeconds()).isPositive();
        String rotatedAccess = cookie(rotatedResponse, "nsm_at");
        assertThat(rotatedAccess).isNotBlank();
        // O sid mantém-se: é a mesma sessão (e a mesma janela de inatividade).
        assertThat(jwtService.parseClaims(rotatedAccess).get("sid", String.class))
                .isEqualTo(jwtService.parseClaims(cookie(session.response(), "nsm_at")).get("sid", String.class));
    }

    @Test
    void refreshEhRecusadoQuandoASessaoFicaOciosa() {
        Session session = register();
        String refreshToken = cookie(session.response(), "nsm_rt");
        String sid = jwtService.parseClaims(refreshToken).get("sid", String.class);
        // Simula a janela de inatividade esgotada (o Redis apaga a chave no TTL).
        sessionIdleService.end(sid);

        assertThatThrownBy(() -> authService.refreshToken(
                refreshToken, new MockHttpServletResponse(), "127.0.0.1", "test-agent"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("inatividade");
    }

    @Test
    void logoutTerminaAJANelaDeInatividade() {
        Session session = register();
        String sid = jwtService.parseClaims(cookie(session.response(), "nsm_at")).get("sid", String.class);
        assertThat(sessionIdleService.isExpired(sid)).isFalse();

        authService.logout(session.auth().user().id(), sid, new MockHttpServletResponse(), "127.0.0.1", "test-agent");

        assertThat(sessionIdleService.isExpired(sid)).isTrue();
    }
}
