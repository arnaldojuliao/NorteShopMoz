package mz.norteshopmoz.api.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuração tipada do prefixo `app.*`
 * (JWT + CORS + email + login social + cookies + pagamentos).
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(Jwt jwt, Cors cors, Mail mail, Social social, Cookie cookie, Payments payments,
                            Audit audit, Whatsapp whatsapp) {

    public record Jwt(String secret, long expirationSeconds, long refreshExpirationSeconds) {
        public Duration expiration() {
            return Duration.ofSeconds(expirationSeconds);
        }

        public Duration refreshExpiration() {
            return Duration.ofSeconds(refreshExpirationSeconds);
        }
    }

    public record Cors(List<String> allowedOrigins) {}

    /** Email transacional (Resend). `resendApiKey` vazio → modo dev (não envia). */
    public record Mail(String resendApiKey, String from, String baseUrl) {}

    /**
     * Login social (Google/Facebook). IDs vazios → funcionalidade desativada
     * (o frontend oculta os botões quando as variáveis NEXT_PUBLIC_* faltam).
     */
    public record Social(String googleClientId, String facebookAppId, String facebookAppSecret) {}

    /** Configuração de cookies seguros para JWT. */
    public record Cookie(boolean secure, String domain) {
        // secure=true em produção (HTTPS), false em dev (HTTP localhost)
        // domain=vazio para localhost, ex: ".norteshopmoz.com" para subdomínios em produção
    }

    /**
     * Gateway de pagamento (PaySuite — M-Pesa / e-Mola / cartão).
     *
     * <p>{@code mode=simulated} (omissão) usa o gateway simulado — só em
     * dev/testes, nunca em produção. {@code mode=live} registra o adaptador real
     * ({@link mz.norteshopmoz.api.service.PaySuitePaymentGateway}) e exige
     * {@code api-key}: sem ela a aplicação <strong>não arranca</strong>, porque um
     * gateway "live" sem credenciais aceitaria pedidos que nunca chegariam a ser
     * cobrados.</p>
     *
     * <ul>
     *   <li>{@code base-url} — raiz da API do provedor (omissão:
     *       {@code https://paysuite.tech/api/v1}). Apontar para
     *       {@code https://paysuite.test/...} (sandbox) em testes.</li>
     *   <li>{@code webhook-secret} — chave partilhada que assina as notificações
     *       assíncronas ({@code POST /api/payments/webhook}, cabeçalho
     *       {@code X-Signature} = HMAC-SHA256 do corpo cru). Vazio → o endpoint
     *       responde 503 e nenhum pedido é confirmado por essa via (nunca aceita
     *       notificações não assinadas).</li>
     *   <li>{@code webhook-url} / {@code return-url} — URLs públicos da loja
     *       enviados em cada pedido de pagamento (para onde o provedor notifica e
     *       para onde devolve o cliente depois de pagar). Opcionais: sem eles usa-se
     *       a configuração de conta no painel do provedor.</li>
     * </ul>
     */
    public record Payments(String mode, String baseUrl, String apiKey, String webhookSecret,
                           String webhookUrl, String returnUrl, long timeoutMs) {

        /** Timeout de cada chamada ao gateway (ligação e resposta). */
        public Duration timeout() {
            return Duration.ofMillis(timeoutMs > 0 ? timeoutMs : 15_000);
        }

        /** Verdadeiro quando a integração real está ativa. */
        public boolean live() {
            return "live".equalsIgnoreCase(mode);
        }
    }

    /**
     * Export opcional de auditoria para um destino externo (SIEM — Elastic,
     * Splunk, Datadog, endpoint próprio). {@code webhook-url} vazio → desligado:
     * os eventos continuam a ir para o log {@code AUDIT} (o padrão de sempre).
     * Falhas de entrega são apenas logadas — a auditoria nunca pode derrubar o
     * fluxo que está a auditar.
     */
    public record Audit(String webhookUrl) {}

    /**
     * Canal de notificações WhatsApp, consumidor das preferências
     * {@code notifWhatsapp*} que o utilizador já podia ligar em
     * {@code /configuracoes} (e que eram gravadas sem consumidor). Genérico por
     * desenho: qualquer provedor com um {@code POST} JSON
     * {@code {to, message}} e um {@code Bearer} serve (Confirme.io, Twilio via
     * adaptador, endpoint próprio). {@code api-url} vazio → desligado (modo dev:
     * loga a mensagem em vez de a enviar). Falha aberta — nunca bloqueia o
     * pedido nem o email por causa do WhatsApp.
     *
     * <p>{@code adminPhone} (só dígitos, com indicativo) recebe os avisos
     * operacionais da loja — hoje o pedido que ficou sem link de pagamento.
     * Vazio = o admin só é avisado por email.</p>
     */
    public record Whatsapp(String apiUrl, String apiToken, String adminPhone) {}
}
