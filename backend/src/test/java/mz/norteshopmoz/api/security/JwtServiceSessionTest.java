package mz.norteshopmoz.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import mz.norteshopmoz.api.config.AppProperties;
import mz.norteshopmoz.api.domain.UserAccount;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

/**
 * O {@code sid} (id de sessão) tem de viajar nos DOIS tokens: no access token, para
 * o filtro medir a inatividade em cada pedido; no refresh token, para o
 * {@code /api/auth/refresh} recusar reviver uma sessão ociosa.
 */
class JwtServiceSessionTest {

    private static final String SECRET = "segredo-de-teste-com-mais-de-32-caracteres-aqui";

    private final JwtService jwtService = new JwtService(new AppProperties(
            new AppProperties.Jwt(SECRET, 3600, 7200),
            new AppProperties.Cors(List.of("http://localhost:3000")),
            null, null, null), new MockEnvironment());

    private static UserAccount user() {
        return UserAccount.builder()
                .id("user-1")
                .email("cliente@example.com")
                .fullName("Cliente Teste")
                .role("CUSTOMER")
                .build();
    }

    @Test
    void accessTokenTransportaOSid() {
        var claims = jwtService.parseClaims(jwtService.generateToken(user(), "sessao-abc"));

        assertThat(claims.get("sid", String.class)).isEqualTo("sessao-abc");
        assertThat(claims.get("typ", String.class)).isEqualTo("access");
        assertThat(claims.get("uid", String.class)).isEqualTo("user-1");
    }

    @Test
    void refreshTokenTransportaOMesmoSid() {
        var claims = jwtService.parseClaims(jwtService.generateRefreshToken(user(), "sessao-abc"));

        assertThat(claims.get("sid", String.class)).isEqualTo("sessao-abc");
        assertThat(claims.get("typ", String.class)).isEqualTo("refresh");
    }

    @Test
    void semSessaoNaoExisteClaimSid() {
        assertThat(jwtService.parseClaims(jwtService.generateToken(user(), null)).get("sid")).isNull();
        assertThat(jwtService.parseClaims(jwtService.generateToken(user(), "  ")).get("sid")).isNull();
    }
}
