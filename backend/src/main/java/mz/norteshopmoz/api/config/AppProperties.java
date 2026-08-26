package mz.norteshopmoz.api.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Configuração tipada do prefixo `app.*` (JWT + CORS + email + login social + cookies). */
@ConfigurationProperties(prefix = "app")
public record AppProperties(Jwt jwt, Cors cors, Mail mail, Social social, Cookie cookie) {

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
        // domain=vazio para localhost, ex: ".norteshop.com" para subdomínios em produção
    }
}