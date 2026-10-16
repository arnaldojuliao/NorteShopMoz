package mz.norteshopmoz.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import mz.norteshopmoz.api.config.AppProperties;
import mz.norteshopmoz.api.exception.ApiException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Adaptador da PaySuite, exercitado contra um servidor local que faz de provedor.
 *
 * <p>Verifica o que um gateway não pode errar: o contrato exato enviado (caminho,
 * método HTTP, credenciais e campos), a extração do {@code data.id} e do
 * {@code checkout_url}, e a tradução de cada falha (recusa, credenciais
 * inválidas, limite de pedidos, indisponibilidade, resposta sem id) num erro de
 * negócio distinto — nunca num sucesso.</p>
 */
class PaySuitePaymentGatewayTest {

    private HttpServer server;
    private String baseUrl;
    private final List<String> requests = new CopyOnWriteArrayList<>();
    private volatile int responseStatus = 201;
    private volatile String responseBody = "{}";

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            requests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI()
                    + " auth=" + exchange.getRequestHeaders().getFirst("Authorization")
                    + " body=" + body);
            byte[] out = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(responseStatus, out.length);
            exchange.getResponseBody().write(out);
            exchange.close();
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    private PaySuitePaymentGateway gateway() {
        return new PaySuitePaymentGateway(props("live", baseUrl, "chave-teste", "segredo"),
                HttpClient.newHttpClient());
    }

    private static AppProperties props(String mode, String baseUrl, String apiKey, String secret) {
        return new AppProperties(null, null, null, null, null,
                new AppProperties.Payments(mode, baseUrl, apiKey, secret,
                        "https://loja.mz/api/payments/webhook", "https://loja.mz/pedidos", 5_000),
                null, null);
    }

    private static String paymentResponse(String id, String checkoutUrl) {
        return "{\"status\":\"success\",\"data\":{\"id\":\"" + id + "\",\"amount\":15900.00,"
                + "\"reference\":\"NSM-TESTE\",\"status\":\"pending\",\"checkout_url\":\"" + checkoutUrl + "\"}}";
    }

    @Test
    void charge_criaPedidoDePagamentoComOContratoDaPaySuite() {
        responseBody = paymentResponse("01H8X9", "https://paysuite.tech/checkout/01H8X9");

        PaymentGateway.PaymentCharge charge = gateway().charge("NSM-TESTE", "mpesa",
                "+258 84 123 4567", null, new BigDecimal("15900.00"), "MZN",
                "Pedido NSM-TESTE — NorteShopMoz");

        assertThat(charge.reference()).isEqualTo("01H8X9");
        assertThat(charge.checkoutUrl()).isEqualTo("https://paysuite.tech/checkout/01H8X9");
        assertThat(charge.redirectRequired()).isTrue();

        String request = requests.getFirst();
        assertThat(request).startsWith("POST /payments");
        assertThat(request).contains("auth=Bearer chave-teste");
        assertThat(request).contains("\"amount\":\"15900.00\"");
        assertThat(request).contains("\"reference\":\"NSM-TESTE\"");
        assertThat(request).contains("\"method\":\"mpesa\"");
        assertThat(request).contains("\"return_url\":\"https://loja.mz/pedidos\"");
        assertThat(request).contains("\"webhook_url\":\"https://loja.mz/api/payments/webhook\"");
        // O checkout é hospedado pela PaySuite: a loja não envia telefone nem cartão.
        assertThat(request).doesNotContain("msisdn");
        assertThat(request).doesNotContain("cardNumber");
    }

    @Test
    void charge_cartao_traduzParaCreditCardSemDadosDoCartao() {
        responseBody = paymentResponse("01CARD", "https://paysuite.tech/checkout/01CARD");

        gateway().charge("NSM-CARD", "card", null, "1234", new BigDecimal("500"), "MZN", null);

        assertThat(requests.getFirst()).contains("\"method\":\"credit_card\"");
        assertThat(requests.getFirst()).doesNotContain("cardLast4");
    }

    @Test
    void charge_metodoForaDoContrato_falhaAntesDeChamarOProvedor() {
        // A PaySuite só aceita mpesa/emola/credit_card: enviar outro valor devolveria
        // um 422 opaco, por isso falha-se aqui, com uma mensagem clara.
        assertThatThrownBy(() -> gateway().charge("NSM-1", "paypal", null, null,
                BigDecimal.TEN, "MZN", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("sem suporte");
        assertThat(requests).isEmpty();
    }

    @Test
    void charge_valorNaoPositivo_falhaAntesDeChamarOProvedor() {
        assertThatThrownBy(() -> gateway().charge("NSM-1", "mpesa", null, null,
                BigDecimal.ZERO, "MZN", null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(requests).isEmpty();
    }

    @Test
    void charge_semCheckoutUrl_nuncaViraSucesso() {
        // Sem página de pagamento o cliente ficava num impasse — falha com um erro
        // claro em vez de criar um pedido que não pode ser pago.
        responseBody = "{\"status\":\"success\",\"data\":{\"id\":\"01H8X9\"}}";

        assertThatThrownBy(() -> gateway().charge("NSM-1", "mpesa", null, null,
                BigDecimal.TEN, "MZN", null))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("página de pagamento");
    }

    @Test
    void charge_semId_nuncaViraSucesso() {
        responseBody = "{\"status\":\"success\",\"data\":{\"status\":\"pending\"}}";

        assertThatThrownBy(() -> gateway().charge("NSM-1", "mpesa", null, null,
                BigDecimal.TEN, "MZN", null))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Resposta inválida");
    }

    @Test
    void charge_provedorIndisponivel_devolve503() {
        responseStatus = 503;
        responseBody = "{\"status\":\"error\",\"message\":\"unavailable\"}";

        assertThatThrownBy(() -> gateway().charge("NSM-1", "mpesa", null, null,
                BigDecimal.TEN, "MZN", null))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("indisponível");
    }

    @Test
    void charge_credenciaisInvalidas_devolve503SemExporOProblemaAoCliente() {
        // 401 é um problema de configuração da loja (token revogado), não do
        // cliente: fica no log do operador e o cliente recebe uma saída útil.
        responseStatus = 401;
        responseBody = "{\"status\":\"error\",\"message\":\"Invalid API token\"}";

        assertThatThrownBy(() -> gateway().charge("NSM-1", "mpesa", null, null,
                BigDecimal.TEN, "MZN", null))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("temporariamente indisponíveis");
    }

    @Test
    void charge_limiteDePedidos_devolve503Transitorio() {
        responseStatus = 429;
        responseBody = "{\"status\":\"error\",\"message\":\"Too many requests\"}";

        assertThatThrownBy(() -> gateway().charge("NSM-1", "mpesa", null, null,
                BigDecimal.TEN, "MZN", null))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Demasiados pagamentos");
    }

    @Test
    void charge_recusadoPeloProvedor_devolve400() {
        responseStatus = 402;
        responseBody = "{\"status\":\"error\",\"message\":\"Payment failed\"}";

        assertThatThrownBy(() -> gateway().charge("NSM-1", "mpesa", null, null,
                BigDecimal.TEN, "MZN", null))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("não autorizado");
    }

    @Test
    void refund_criaEstornoComPaymentIdEValor() {
        responseBody = "{\"status\":\"success\",\"data\":{\"id\":\"RF1\",\"status\":\"pending\"}}";

        gateway().refund("01H8X9", new BigDecimal("15900.00"));

        String request = requests.getFirst();
        assertThat(request).startsWith("POST /refunds");
        assertThat(request).contains("auth=Bearer chave-teste");
        assertThat(request).contains("\"payment_id\":\"01H8X9\"");
        assertThat(request).contains("\"amount\":\"15900.00\"");
        assertThat(request).contains("\"reason\"");
    }

    @Test
    void refund_semValor_falhaAntesDeChamarOProvedor() {
        assertThatThrownBy(() -> gateway().refund("01H8X9", null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(requests).isEmpty();
    }

    @Test
    void modoLiveSemApiKey_naoArranca() {
        // Um gateway "real" sem credenciais criaria pagamentos que nunca seriam
        // cobrados — a aplicação recusa arrancar em vez de vender de graça.
        assertThatThrownBy(() -> new PaySuitePaymentGateway(props("live", baseUrl, "", "segredo"),
                HttpClient.newHttpClient()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("PAYMENTS_API_KEY");
    }

    @Test
    void modoLiveSemBaseUrl_usaOPadraoDaPaySuite() {
        // Sem base-url configurado usa-se a API de produção da PaySuite — as
        // credenciais continuam a ser obrigatórias (ver teste acima).
        PaySuitePaymentGateway gateway = new PaySuitePaymentGateway(
                props("live", "  ", "chave-teste", "segredo"), HttpClient.newHttpClient());

        assertThat(gateway.hostedCheckout()).isTrue();
    }
}
