package mz.norteshopmoz.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import mz.norteshopmoz.api.service.PaymentGateway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.core.env.Environment;
import org.springframework.mock.env.MockEnvironment;

/**
 * Coerência entre a flag {@code Secure} dos cookies e o esquema da loja.
 *
 * <p>Com {@code APP_COOKIE_SECURE=true} e a loja a servir HTTP, o browser
 * descarta os cookies de sessão e o login "não funciona" sem deixar erro nenhum
 * no servidor — por isso este caso é fail-fast e não apenas um aviso.</p>
 *
 * <p>Cobre também o aviso dos pagamentos: com {@code PAYMENTS_MODE=live} e
 * nenhum {@link PaymentGateway} registado a loja não cobra online e tem de o
 * dizer no arranque — o operador não pode descobri-lo pelo primeiro cliente.</p>
 */
@ExtendWith(OutputCaptureExtension.class)
class ProductionConfigGuardTest {

    /** Gateway de mentira: só interessa que o bean EXISTA. */
    private static final PaymentGateway GATEWAY = new PaymentGateway() {
        @Override
        public PaymentCharge charge(String reference, String methodId, String phone, String cardLast4,
                                    BigDecimal amount, String currency, String description) {
            return PaymentCharge.confirmed("REF-TESTE");
        }

        @Override
        public void refund(String reference, BigDecimal amount) {
            // nada a fazer num teste
        }
    };

    private static Environment prod() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        return environment;
    }

    @SuppressWarnings("unchecked")
    private static ObjectProvider<PaymentGateway> provider(PaymentGateway gateway) {
        ObjectProvider<PaymentGateway> mock = mock(ObjectProvider.class);
        when(mock.getIfAvailable()).thenReturn(gateway);
        return mock;
    }

    private static ProductionConfigGuard guard(Environment environment, boolean cookieSecure, String baseUrl) {
        return guard(environment, "live", null, cookieSecure, baseUrl);
    }

    private static ProductionConfigGuard guard(Environment environment, String paymentsMode,
            PaymentGateway gateway, boolean cookieSecure, String baseUrl) {
        return new ProductionConfigGuard(environment, paymentsMode, "segredo-webhook",
                "https://loja.mz/api/payments/webhook", provider(gateway),
                cookieSecure, baseUrl,
                List.of("https://loja.mz"), "172.28.0.10", "re_chave", "cloud", 730,
                "noreply@loja.mz", "google-cli", "fb-id", "fb-secret");
    }

    /** Guarda sem URL de webhook configurado (usa a configuração de conta da PaySuite). */
    private static ProductionConfigGuard guardSemWebhookUrl(Environment environment,
            String paymentsMode) {
        return new ProductionConfigGuard(environment, paymentsMode, "segredo-webhook", "",
                provider(GATEWAY), true, "https://loja.mz",
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

    @Test
    void emProducaoComModoLiveSemGatewayAvisaQueNaoSeCobraOnline(CapturedOutput output) {
        guard(prod(), "live", null, true, "https://loja.mz").run(null);

        assertThat(output).contains("PAYMENTS_MODE=live mas NÃO há nenhum PaymentGateway");
    }

    @Test
    void emProducaoComGatewayRegistadoNaoAvisa(CapturedOutput output) {
        guard(prod(), "live", GATEWAY, true, "https://loja.mz").run(null);

        assertThat(output).doesNotContain("PAYMENTS_MODE");
    }

    @Test
    void emProducaoComModoSimuladoAvisaQueOsPagamentosOnlineEstaoDesativados(CapturedOutput output) {
        guard(prod(), "simulated", null, true, "https://loja.mz").run(null);

        assertThat(output).contains("estão DESATIVADOS");
    }

    @Test
    void foraDeProducaoNaoAvisaDePagamentos(CapturedOutput output) {
        guard(new MockEnvironment(), "live", null, true, "http://localhost:3000").run(null);

        assertThat(output).doesNotContain("PAYMENTS_MODE");
    }

    @Test
    void emProducaoSemWebhookUrlAvisaQueUsaAConfiguracaoDaConta(CapturedOutput output) {
        guardSemWebhookUrl(prod(), "live").run(null);

        assertThat(output).contains("PAYMENTS_WEBHOOK_URL vazio");
    }

    @Test
    void emProducaoComWebhookUrlNaoAvisa(CapturedOutput output) {
        guard(prod(), "live", GATEWAY, true, "https://loja.mz").run(null);

        assertThat(output).doesNotContain("PAYMENTS_WEBHOOK_URL");
    }
}
