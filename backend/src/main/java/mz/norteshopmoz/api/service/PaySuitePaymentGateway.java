package mz.norteshopmoz.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.InetSocketAddress;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import mz.norteshopmoz.api.config.AppProperties;
import mz.norteshopmoz.api.exception.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Gateway de pagamento REAL — adaptador para a <strong>PaySuite</strong>
 * (M-Pesa, e-Mola, mKesh e cartões Visa/Mastercard em Moçambique).
 *
 * <p>Ativo apenas com {@code app.payments.mode=live} (env {@code PAYMENTS_MODE}).
 * Sem {@code api-key} a aplicação <strong>não arranca</strong>: um gateway
 * marcado como real mas sem credenciais criaria pedidos de pagamento que nunca
 * seriam cobrados — o pior erro possível numa loja.</p>
 *
 * <h2>Contrato (api.paysuite.tech/docs)</h2>
 *
 * <ul>
 *   <li><b>Criar pagamento</b> — {@code POST {base-url}/payments} com
 *       {@code Authorization: Bearer {api-key}} e corpo
 *       {@code {amount, reference, method, description, return_url, webhook_url}}.
 *       {@code method} ∈ {@code mpesa | emola | credit_card}. Resposta 201:
 *       {@code data.id} (ULID) + {@code data.checkout_url}.</li>
 *   <li><b>Estorno</b> — {@code POST {base-url}/refunds} com
 *       {@code {payment_id, amount, reason}} (o {@code payment_id} é o ULID
 *       devolvido na criação).</li>
 *   <li><b>Confirmação</b> — a PaySuite confirma <em>assincronamente</em> por
 *       webhook ({@code payment.success}/{@code payment.failed}), assinado com
 *       {@code X-Signature} (ver {@link PaymentWebhookService}).</li>
 * </ul>
 *
 * <p>Como a PaySuite usa <strong>checkout hospedado</strong>, esta classe
 * devolve o {@code checkout_url} e o pedido fica em {@code Aguarda pagamento}
 * até à notificação assinada — a loja nunca marca como pago algo que ainda não
 * o está. O telefone/cartão do cliente são recolhidos na página da PaySuite
 * ({@link #hostedCheckout()} {@code = true}), pelo que não seguem no pedido.</p>
 *
 * <p><strong>Segredos</strong>: a chave de API nunca é registada em log nem
 * devolvida ao cliente; a resposta do provedor só em nível DEBUG.</p>
 */
@Component
@ConditionalOnProperty(name = "app.payments.mode", havingValue = "live")
public class PaySuitePaymentGateway implements PaymentGateway {

    private static final Logger log = LoggerFactory.getLogger(PaySuitePaymentGateway.class);

    /** Raiz da API da PaySuite (produção). Sobrepõe-se com PAYMENTS_BASE_URL. */
    private static final String DEFAULT_BASE_URL = "https://paysuite.tech/api/v1";

    private static final String PAYMENTS_PATH = "/payments";
    private static final String REFUNDS_PATH = "/refunds";

    /** Limites do contrato da PaySuite (referência e descrição). */
    private static final int MAX_REFERENCE = 50;
    private static final int MAX_DESCRIPTION = 125;

    private final String baseUrl;
    private final String apiKey;
    private final String webhookUrl;
    private final String returnUrl;
    private final Duration timeout;
    private final HttpClient http;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    public PaySuitePaymentGateway(AppProperties props) {
        this(props, null);
    }

    /** Construtor de teste: permite injetar um {@link HttpClient} próprio. */
    PaySuitePaymentGateway(AppProperties props, HttpClient httpClient) {
        AppProperties.Payments cfg = props.payments();
        String configuredBase = cfg == null ? null : cfg.baseUrl();
        this.baseUrl = (configuredBase == null || configuredBase.isBlank()
                ? DEFAULT_BASE_URL : configuredBase.trim()).replaceAll("/+$", "");
        this.apiKey = cfg == null || cfg.apiKey() == null ? "" : cfg.apiKey().trim();
        this.webhookUrl = blankToNull(cfg == null ? null : cfg.webhookUrl());
        this.returnUrl = blankToNull(cfg == null ? null : cfg.returnUrl());
        this.timeout = cfg == null ? Duration.ofSeconds(15) : cfg.timeout();

        if (apiKey.isBlank()) {
            throw new IllegalStateException("""
                    app.payments.mode=live exige app.payments.api-key (env PAYMENTS_API_KEY) — \
                    obtenha o token em PaySuite > Settings > API Access. Sem credenciais, um \
                    gateway marcado como real criaria pedidos de pagamento que nunca chegam a \
                    ser cobrados. Defina PAYMENTS_API_KEY ou volte a PAYMENTS_MODE=simulated \
                    (a loja fica no ar; os pagamentos online respondem 503 e o checkout \
                    desativa-os).""");
        }
        this.http = httpClient != null ? httpClient : buildHttpClient();
        log.info("Gateway de pagamento PaySuite ligado a {} (timeout {} ms)", baseUrl,
                timeout.toMillis());
    }

    @Override
    public boolean hostedCheckout() {
        return true;
    }

    @Override
    public PaymentCharge charge(String reference, String methodId, String phone, String cardLast4,
                                BigDecimal amount, String currency, String description) {
        if (amount == null || amount.signum() <= 0) {
            // A PaySuite só aceita valores positivos (min 0.01) — rejeitar aqui evita
            // um pedido de pagamento inválido e a confusão de um erro genérico do provedor.
            throw new IllegalArgumentException("Valor de cobrança inválido: " + amount);
        }
        String method = mapMethod(methodId);
        String safeReference = truncate(requireText(reference, "referência"), MAX_REFERENCE);

        ObjectNode body = objectMapper.createObjectNode();
        // Valor como string decimal: o total tem de ser exatamente o recalculado no
        // servidor, sem arredondamentos de vírgula flutuante.
        body.put("amount", amount.setScale(2, RoundingMode.HALF_UP).toPlainString());
        body.put("reference", safeReference);
        body.put("method", method);
        if (description != null && !description.isBlank()) {
            body.put("description", truncate(description, MAX_DESCRIPTION));
        }
        if (returnUrl != null) {
            body.put("return_url", returnUrl);
        }
        if (webhookUrl != null) {
            body.put("webhook_url", webhookUrl);
        }

        HttpResponse<String> response = send(
                HttpRequest.newBuilder(URI.create(baseUrl + PAYMENTS_PATH))
                        .timeout(timeout)
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        .header("Authorization", "Bearer " + apiKey)
                        .POST(HttpRequest.BodyPublishers.ofString(body.toString())),
                "criação do pagamento " + safeReference);

        JsonNode data = responseData(response.body());
        String paymentId = text(data, "id");
        String checkoutUrl = text(data, "checkout_url");
        if (paymentId == null || paymentId.isBlank()) {
            // 2xx sem id: pagamento sem identificador não é reconciliável (nem
            // estornável, nem confirmável por webhook) — trata-se como falha em vez
            // de gravar o pedido com uma referência órfã.
            log.error("Resposta da PaySuite sem id de pagamento (HTTP {}): {}",
                    response.statusCode(), truncate(response.body()));
            throw ApiException.serviceUnavailable(
                    "Resposta inválida do gateway de pagamento — tente novamente.");
        }
        if (checkoutUrl == null || checkoutUrl.isBlank()) {
            // Sem checkout_url não há como o cliente pagar. Aconteceria só se o
            // contrato da PaySuite mudasse — melhor falhar com um erro claro do que
            // deixar o cliente num impasse.
            log.error("Resposta da PaySuite sem checkout_url (HTTP {}) para o pagamento {}",
                    response.statusCode(), paymentId);
            throw ApiException.serviceUnavailable(
                    "Gateway de pagamento não devolveu a página de pagamento — tente novamente.");
        }
        log.info("Pagamento PaySuite criado (método {}, valor {} {}, id {})",
                method, amount, currency, paymentId);
        return PaymentCharge.redirect(paymentId, checkoutUrl);
    }

    @Override
    public void refund(String reference, BigDecimal amount) {
        if (reference == null || reference.isBlank()) {
            throw new IllegalArgumentException("Referência de estorno ausente");
        }
        if (amount == null || amount.signum() <= 0) {
            throw new IllegalArgumentException("Valor de estorno inválido: " + amount);
        }
        ObjectNode body = objectMapper.createObjectNode();
        body.put("payment_id", reference);
        body.put("amount", amount.setScale(2, RoundingMode.HALF_UP).toPlainString());
        body.put("reason", "Pedido não concluído na loja NorteShopMoz");
        if (webhookUrl != null) {
            body.put("webhook_url", webhookUrl);
        }

        send(HttpRequest.newBuilder(URI.create(baseUrl + REFUNDS_PATH))
                        .timeout(timeout)
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        .header("Authorization", "Bearer " + apiKey)
                        .POST(HttpRequest.BodyPublishers.ofString(body.toString())),
                "estorno do pagamento " + reference);
        log.info("Estorno aceite pela PaySuite (pagamento {})", reference);
    }

    /* ── Tradução para o contrato da PaySuite ────────────────────────────── */

    /**
     * Mapeia o id interno do método para o {@code method} da PaySuite
     * ({@code mpesa | emola | credit_card}). Um método fora do contrato falha
     * antes de chamar o provedor — enviar um valor desconhecido devolveria um 422
     * genérico que não ajuda ninguém.
     */
    private static String mapMethod(String methodId) {
        return switch (methodId == null ? "" : methodId.trim().toLowerCase()) {
            case "mpesa", "m-pesa" -> "mpesa";
            case "emola", "e-mola" -> "emola";
            case "mkesh", "m-kesh" -> "mkesh";
            case "card", "credit_card", "creditcard" -> "credit_card";
            default -> throw new IllegalArgumentException("Método de pagamento sem suporte no gateway: "
                    + methodId);
        };
    }

    /* ── Extração da resposta ────────────────────────────────────────────── */

    private JsonNode responseData(String responseBody) {
        JsonNode root = parse(responseBody);
        if (root == null) {
            return objectMapper.createObjectNode();
        }
        JsonNode data = root.get("data");
        return data != null && data.isObject() ? data : root;
    }

    private JsonNode parse(String responseBody) {
        if (responseBody == null || responseBody.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(responseBody);
        } catch (IOException e) {
            log.warn("Resposta da PaySuite não é JSON válido: {}", truncate(responseBody));
            return null;
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        String s = value.asText();
        return s.isBlank() ? null : s;
    }

    /* ── Infraestrutura ──────────────────────────────────────────────────── */

    /**
     * Executa o pedido e traduz o resultado em erro de negócio.
     *
     * <p>Um erro do gateway <strong>nunca</strong> pode parecer sucesso: um
     * timeout, um 5xx ou uma ligação recusada devolvem 503 (o cliente pode
     * tentar de novo) e uma recusa do provedor devolve 400 com uma mensagem
     * genérica — a mensagem crua do provedor não é reenviada ao browser.</p>
     *
     * <p>Mapa de erros da PaySuite: 400/422 dados inválidos, 401 token inválido,
     * 402 pagamento falhado, 404 recurso inexistente, 429 limite de pedidos
     * (100/min por comerciante).</p>
     */
    private HttpResponse<String> send(HttpRequest.Builder builder, String description) {
        HttpResponse<String> response;
        try {
            response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.error("Falha de rede na PaySuite ({})", description, e);
            throw ApiException.serviceUnavailable(
                    "Não foi possível contactar o gateway de pagamento — tente novamente.");
        }

        int status = response.statusCode();
        if (status >= 200 && status < 300) {
            return response;
        }
        if (status == 429) {
            // Limite de 100 pedidos/minuto por comerciante: é transitório, mas não
            // é responsabilidade do cliente — merece uma mensagem de "tente já a seguir".
            log.warn("PaySuite recusou {} por limite de pedidos (HTTP 429)", description);
            throw ApiException.serviceUnavailable(
                    "Demasiados pagamentos em curso — tente novamente dentro de instantes.");
        }
        if (status >= 500) {
            log.error("PaySuite indisponível (HTTP {}) em {}", status, description);
            throw ApiException.serviceUnavailable(
                    "Gateway de pagamento indisponível — tente novamente.");
        }
        if (status == 401) {
            // Token inválido/revogado: problema de configuração da loja, não do
            // cliente. Fica no log em ERROR para o operador ver; o cliente recebe
            // uma mensagem genérica (nunca se expõe detalhe de credenciais).
            log.error("PaySuite rejeitou as credenciais (HTTP 401) em {} — verifique PAYMENTS_API_KEY",
                    description);
            throw ApiException.serviceUnavailable(
                    "Pagamentos online temporariamente indisponíveis. Escolha pagamento na entrega "
                            + "ou transferência bancária.");
        }
        log.warn("PaySuite recusou {} (HTTP {})", description, status);
        throw ApiException.badRequest(
                "Pagamento não autorizado pelo gateway. Confirme os dados e tente novamente.");
    }

    /** Cliente HTTP que respeita HTTPS_PROXY/HTTP_PROXY (igual ao CloudinaryService). */
    private static HttpClient buildHttpClient() {
        HttpClient.Builder builder = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10));
        String proxyUrl = firstNonBlank(System.getenv("HTTPS_PROXY"), System.getenv("https_proxy"));
        if (proxyUrl == null) {
            proxyUrl = firstNonBlank(System.getenv("HTTP_PROXY"), System.getenv("http_proxy"));
        }
        if (proxyUrl != null) {
            try {
                URI uri = URI.create(proxyUrl);
                int port = uri.getPort() == -1 ? 8080 : uri.getPort();
                builder.proxy(ProxySelector.of(new InetSocketAddress(uri.getHost(), port)));
            } catch (IllegalArgumentException ignored) {
                // URL de proxy inválida — segue sem proxy.
            }
        }
        return builder.build();
    }

    private static String firstNonBlank(String a, String b) {
        return a != null && !a.isBlank() ? a : (b != null && !b.isBlank() ? b : null);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String requireText(String value, String what) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Falta a " + what + " do pagamento");
        }
        return value.trim();
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }

    /** Recorte para logs — uma resposta do provedor nunca vai inteira para o log. */
    private static String truncate(String s) {
        if (s == null) {
            return "";
        }
        return s.length() <= 300 ? s : s.substring(0, 300) + "…";
    }
}
