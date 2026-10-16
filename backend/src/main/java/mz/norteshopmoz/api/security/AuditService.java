package mz.norteshopmoz.api.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import mz.norteshopmoz.api.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Auditoria de eventos de segurança.
 * Loga eventos críticos para detecção de anomalias e compliance.
 *
 * <p>Export opcional para SIEM (Elastic, Splunk, Datadog, endpoint próprio):
 * com {@code app.audit.webhook-url} definido (env {@code AUDIT_WEBHOOK_URL}),
 * cada evento é também enviado como POST JSON assíncrono para esse destino.
 * O export é <strong>best-effort</strong> — falhas de entrega são logadas e
 * nunca afetam o fluxo que está a ser auditado (o log local {@code AUDIT}
 * continua a ser a fonte primária).</p>
 */
@Service
public class AuditService {

    private static final Logger auditLog = LoggerFactory.getLogger("AUDIT");

    private static final Duration WEBHOOK_TIMEOUT = Duration.ofSeconds(3);

    private final String webhookUrl;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient webhookHttp;

    public AuditService(AppProperties props) {
        AppProperties.Audit cfg = props == null ? null : props.audit();
        this.webhookUrl = cfg == null || cfg.webhookUrl() == null || cfg.webhookUrl().isBlank()
                ? null : cfg.webhookUrl().trim();
        this.webhookHttp = webhookUrl == null
                ? null
                : HttpClient.newBuilder().connectTimeout(WEBHOOK_TIMEOUT).build();
    }

    /** Eventos de autenticação. */
    public enum AuthEvent {
        LOGIN_SUCCESS,
        LOGIN_FAILURE,
        LOGOUT,
        REGISTER,
        PASSWORD_RESET_REQUEST,
        PASSWORD_RESET_SUCCESS,
        PASSWORD_CHANGE,
        EMAIL_VERIFIED,
        SOCIAL_LOGIN,
        TOKEN_REFRESH,
        SESSION_REVOKED,
        ACCOUNT_LOCKED
    }

    /** Regista evento de autenticação. */
    public void logAuthEvent(AuthEvent event, String email, String ip, String userAgent, boolean success, String details) {
        String marker = success ? "SUCCESS" : "FAILURE";
        auditLog.info("AUTH_EVENT type={} email={} ip={} ua={} result={} details={}",
                event.name(), maskEmail(email), ip, truncate(userAgent, 100), marker, details);
        export("AUTH_EVENT", event.name(), null, ip, details, marker, Map.of(
                "email", maskEmail(email), "result", marker, "userAgent", truncate(userAgent, 100)));
    }

    /** Regista evento de autorização (acesso negado, admin actions). */
    public void logAuthzEvent(String event, String userId, String ip, String resource, boolean allowed) {
        auditLog.info("AUTHZ_EVENT type={} userId={} ip={} resource={} allowed={}",
                event, userId, ip, resource, allowed);
        export("AUTHZ_EVENT", event, userId, ip, resource, allowed ? "ALLOWED" : "DENIED", Map.of(
                "resource", resource == null ? "" : resource, "allowed", String.valueOf(allowed)));
    }

    /** Regista evento de dados sensíveis (alteração de perfil, avatar, endereço). */
    public void logDataEvent(String event, String userId, String ip, String details) {
        auditLog.info("DATA_EVENT type={} userId={} ip={} details={}",
                event, userId, ip, details);
        export("DATA_EVENT", event, userId, ip, details, "OK", Map.of());
    }

    /** Regista evento de pagamento/pedido. */
    public void logPaymentEvent(String event, String userId, String ip, String orderId, String details) {
        auditLog.info("PAYMENT_EVENT type={} userId={} ip={} orderId={} details={}",
                event, userId, ip, orderId, details);
        export("PAYMENT_EVENT", event, userId, ip, details, "OK", Map.of(
                "orderId", orderId == null ? "" : orderId));
    }

    /** Regista evento administrativo. */
    public void logAdminEvent(String event, String adminId, String ip, String targetId, String details) {
        auditLog.info("ADMIN_EVENT type={} adminId={} ip={} targetId={} details={}",
                event, adminId, ip, targetId, details);
        export("ADMIN_EVENT", event, adminId, ip, details, "OK", Map.of(
                "targetId", targetId == null ? "" : targetId));
    }

    /**
     * Exporta o evento para o webhook do SIEM, se configurado. Assíncrono
     * ({@code sendAsync}) para nunca atrasar o pedido auditado; qualquer falha
     * é logada e descartada.
     */
    private void export(String category, String type, String userId, String ip,
            String details, String result, Map<String, String> extra) {
        if (webhookUrl == null) {
            return;
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("category", category);
            payload.put("type", type);
            payload.put("userId", userId == null ? null : userId);
            payload.put("ip", ip == null ? null : ip);
            payload.put("result", result);
            payload.put("details", details == null ? null : truncate(details, 500));
            payload.put("timestamp", java.time.Instant.now().toString());
            payload.putAll(extra);
            HttpRequest request = HttpRequest.newBuilder(URI.create(webhookUrl))
                    .timeout(WEBHOOK_TIMEOUT)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                    .build();
            webhookHttp.sendAsync(request, HttpResponse.BodyHandlers.discarding())
                    .whenComplete((response, error) -> {
                        if (error != null) {
                            auditLog.warn("Export de auditoria falhou (ignorado): {}", error.toString());
                        } else if (response.statusCode() >= 300) {
                            auditLog.warn("Export de auditoria recusado pelo destino: HTTP {} (ignorado)",
                                    response.statusCode());
                        }
                    });
        } catch (Exception e) {
            auditLog.warn("Export de auditoria falhou (ignorado)", e);
        }
    }

    private String maskEmail(String email) {
        if (email == null || !email.contains("@")) return "unknown";
        String[] parts = email.split("@");
        String local = parts[0];
        if (local.length() <= 2) return "**@" + parts[1];
        return local.charAt(0) + "***" + local.charAt(local.length() - 1) + "@" + parts[1];
    }

    private String truncate(String str, int maxLen) {
        if (str == null) return "-";
        return str.length() > maxLen ? str.substring(0, maxLen) + "..." : str;
    }

    /**
     * Extrai o IP do cliente para os logs de auditoria.
     * <p>
     * Delega no {@link ClientIpResolver}: só confia em
     * {@code X-Forwarded-For}/{@code X-Real-IP} quando a ligação direta vem de um
     * proxy fidedigno e usa o último elemento do XFF. Ler o header sem estas
     * regras permite a um cliente forjar o IP e poluir a auditoria.
     */
    public static String getClientIp(HttpServletRequest request) {
        return ClientIpResolver.resolve(request);
    }

    /** Extrai User-Agent do request. */
    public static String getUserAgent(HttpServletRequest request) {
        return request.getHeader("User-Agent");
    }
}