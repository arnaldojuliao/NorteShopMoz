package mz.norteshopmoz.api.config;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

/**
 * Avisos de arranque para configurações de produção que, em silêncio, quebram
 * a loja ou a tornam insegura. Complementa as verificações fail-fast do
 * {@code JwtService}/{@code DataSeeder} (segredos públicos) com os casos em que
 * não é seguro recusar o arranque, mas é essencial deixar um sinal claro nos
 * logs.
 *
 * <p>Escreve apenas quando o perfil {@code prod} está ativo — em dev/testes
 * estes valores são normais.</p>
 */
@Component
public class ProductionConfigGuard implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ProductionConfigGuard.class);

    private final Environment environment;
    private final String paymentsMode;
    private final boolean cookieSecure;
    private final String baseUrl;
    private final List<String> corsOrigins;
    private final String trustedProxies;
    private final String resendApiKey;
    private final String cloudinaryCloudName;
    private final int orderRetentionDays;
    private final String mailFrom;
    private final String googleClientId;
    private final String facebookAppId;
    private final String facebookAppSecret;

    public ProductionConfigGuard(
            Environment environment,
            @Value("${app.payments.mode:simulated}") String paymentsMode,
            @Value("${app.cookie.secure:true}") boolean cookieSecure,
            @Value("${app.mail.base-url:}") String baseUrl,
            @Value("${app.cors.allowed-origins:}") List<String> corsOrigins,
            @Value("${app.security.trusted-proxies:}") String trustedProxies,
            @Value("${app.mail.resend-api-key:}") String resendApiKey,
            @Value("${app.cloudinary.cloud-name:}") String cloudinaryCloudName,
            @Value("${app.orders.retention-days:0}") int orderRetentionDays,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${app.social.google-client-id:}") String googleClientId,
            @Value("${app.social.facebook-app-id:}") String facebookAppId,
            @Value("${app.social.facebook-app-secret:}") String facebookAppSecret) {
        this.environment = environment;
        this.paymentsMode = paymentsMode;
        this.cookieSecure = cookieSecure;
        this.baseUrl = baseUrl;
        this.corsOrigins = corsOrigins;
        this.trustedProxies = trustedProxies;
        this.resendApiKey = resendApiKey;
        this.cloudinaryCloudName = cloudinaryCloudName;
        this.orderRetentionDays = orderRetentionDays;
        this.mailFrom = mailFrom;
        this.googleClientId = googleClientId;
        this.facebookAppId = facebookAppId;
        this.facebookAppSecret = facebookAppSecret;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!environment.acceptsProfiles(Profiles.of("prod"))) {
            return;
        }

        // Pagamentos: o gateway simulado não existe em prod (ver
        // SimulatedPaymentGateway). Deixa-se o aviso para o operador saber que
        // os métodos online estão indisponíveis de propósito.
        if (!"live".equalsIgnoreCase(paymentsMode)) {
            log.warn("[PROD] PAYMENTS_MODE={} — pagamentos online (M-Pesa/e-Mola/cartão) estão DESATIVADOS "
                    + "e respondem 503. Configure uma integração real e PAYMENTS_MODE=live "
                    + "para os aceitar. Pagamento na entrega e transferência continuam a funcionar.",
                    paymentsMode);
        }

        // Coerência cookies ↔ esquema. Este caso é fail-fast (e não aviso) porque
        // falha em silêncio no browser: com `Secure` e a loja a servir HTTP, o
        // browser descarta os cookies de sessão e o login "não funciona" sem
        // erro nenhum no servidor — difícil de diagnosticar em produção.
        boolean https = baseUrl != null && baseUrl.toLowerCase().startsWith("https://");
        if (cookieSecure && !https) {
            throw new IllegalStateException("APP_COOKIE_SECURE=true mas APP_BASE_URL ('" + baseUrl
                    + "') não é https://. Os cookies de sessão (flag Secure) são descartados pelo browser "
                    + "em HTTP e o login falha em silêncio. Configure HTTPS (ver NGINX_CONF no "
                    + "docker-compose.prod.yml) ou, temporariamente em HTTP, defina APP_COOKIE_SECURE=false.");
        }
        if (!cookieSecure) {
            if (https) {
                log.warn("[PROD] APP_COOKIE_SECURE=false com APP_BASE_URL https:// — os cookies de sessão "
                        + "vão SEM a flag Secure e podem ser intercetados numa ligação http. Ative "
                        + "APP_COOKIE_SECURE=true (é o valor por omissão).");
            } else {
                log.warn("[PROD] APP_COOKIE_SECURE=false e a loja serve HTTP — os cookies de sessão viajam "
                        + "em claro. Configure HTTPS e mude para true assim que possível.");
            }
        }

        if (trustedProxies == null || trustedProxies.isBlank()) {
            log.warn("[PROD] TRUSTED_PROXIES vazio — o backend ignora X-Forwarded-For: todos os clientes "
                    + "partilham o mesmo IP, o que faz o rate limit e o lockout de login atuarem sobre a "
                    + "loja inteira. Defina o IP do proxy inverso (ex.: 172.28.0.10).");
        }

        if (corsOrigins == null || corsOrigins.stream().noneMatch(o -> o != null && !o.isBlank())) {
            log.warn("[PROD] CORS_ALLOWED_ORIGINS vazio — pedidos cross-origin serão bloqueados.");
        } else if (corsOrigins.stream().anyMatch(o -> o != null && o.contains("localhost"))) {
            log.warn("[PROD] CORS_ALLOWED_ORIGINS contém 'localhost' ({}) — defina o domínio real da loja.",
                    corsOrigins);
        }

        if (resendApiKey == null || resendApiKey.isBlank()) {
            log.warn("[PROD] RESEND_API_KEY vazio — emails transacionais (confirmação, verificação, "
                    + "recuperação de password) não são enviados.");
        }
        // Remetente de teste do Resend: só entrega ao próprio dono da conta. Em
        // produção, os clientes deixariam de receber confirmações e recuperações
        // sem qualquer erro visível (a API aceita o pedido). É preciso um domínio
        // verificado no Resend e RESEND_FROM nesse domínio.
        if (mailFrom != null && mailFrom.toLowerCase().endsWith("@resend.dev")) {
            log.warn("[PROD] RESEND_FROM ('{}') usa o domínio de TESTE do Resend — os emails só chegam "
                    + "ao dono da conta, não aos clientes. Verifique um domínio no Resend e defina "
                    + "RESEND_FROM nesse domínio (ex.: noreply@norteshopmoz.com).", mailFrom);
        }
        if (cloudinaryCloudName == null || cloudinaryCloudName.isBlank()) {
            log.warn("[PROD] CLOUDINARY_* vazio — os uploads de imagens usam o disco local do contentor, "
                    + "que não sobrevive a um deploy nem é partilhado entre réplicas.");
        }

        // Login social: o backend valida o `aud` do token do Google contra
        // GOOGLE_CLIENT_ID e o debug_token do Facebook contra FACEBOOK_APP_SECRET.
        // Se faltarem, o botão no frontend existe mas o login falha sempre — e o
        // valor tem de coincidir com o NEXT_PUBLIC_GOOGLE_CLIENT_ID do frontend.
        if (googleClientId == null || googleClientId.isBlank()) {
            log.warn("[PROD] GOOGLE_CLIENT_ID vazio — o login com Google está desativado.");
        }
        if (facebookAppId == null || facebookAppId.isBlank()
                || facebookAppSecret == null || facebookAppSecret.isBlank()) {
            log.warn("[PROD] FACEBOOK_APP_ID/FACEBOOK_APP_SECRET em falta — o login com Facebook "
                    + "está desativado.");
        }

        // Crescimento ilimitado da base de dados num VPS único: quando o disco
        // enche, o PostgreSQL deixa de escrever WAL e a loja PARA de aceitar
        // pedidos. Apagar histórico é irreversível (decisão do negócio), por isso
        // não se ativa por omissão — mas o operador tem de saber que está ligado.
        if (orderRetentionDays <= 0) {
            log.warn("[PROD] ORDERS_RETENTION_DAYS=0 — os pedidos entregues/cancelados nunca são "
                    + "apagados e a base de dados cresce indefinidamente; num disco pequeno isso acaba "
                    + "por parar a loja. Defina um número de dias (ex.: 730) se quiser expurgo automático.");
        }
    }
}
