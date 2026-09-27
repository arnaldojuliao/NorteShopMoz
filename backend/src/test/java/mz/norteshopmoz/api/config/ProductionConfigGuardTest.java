package mz.norteshopmoz.api.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.Environment;
import org.springframework.mock.env.MockEnvironment;

/**
 * Coerência entre a flag {@code Secure} dos cookies e o esquema da loja.
 *
 * <p>Com {@code APP_COOKIE_SECURE=true} e a loja a servir HTTP, o browser
 * descarta os cookies de sessão e o login "não funciona" sem deixar erro nenhum
 * no servidor — por isso este caso é fail-fast e não apenas um aviso.</p>
 */
class ProductionConfigGuardTest {

    private static Environment prod() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        return environment;
    }

    private static ProductionConfigGuard guard(Environment environment, boolean cookieSecure, String baseUrl) {
        return new ProductionConfigGuard(environment, "live", cookieSecure, baseUrl,
                List.of("https://loja.mz"), "172.28.0.10", "re_chave", "cloud", 730,
                "noreply@loja.mz", "google-cli", "fb-id", "fb-secret");
    }

    @Test
    void emProducaoRecusaCookiesSecureSobreHttp() {
        assertThatThrownBy(() -> guard(prod(), true, "http://10.0.0.5").run(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("APP_COOKIE_SECURE");
    }

    @Test
    void emProducaoRecusaCookiesSecureSemBaseUrl() {
        assertThatThrownBy(() -> guard(prod(), true, "").run(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("APP_COOKIE_SECURE");
    }

    @Test
    void emProducaoAceitaCookiesSecureSobreHttps() {
        assertThatCode(() -> guard(prod(), true, "https://loja.mz").run(null))
                .doesNotThrowAnyException();
    }

    @Test
    void emProducaoAceitaHttpApenasComCookiesSemSecure() {
        assertThatCode(() -> guard(prod(), false, "http://10.0.0.5").run(null))
                .doesNotThrowAnyException();
    }

    @Test
    void foraDeProducaoOsValoresDeDesenvolvimentoSaoNormais() {
        assertThatCode(() -> guard(new MockEnvironment(), true, "http://localhost:3000").run(null))
                .doesNotThrowAnyException();
    }
}
