package mz.norteshopmoz.api.security;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Auditoria de eventos de segurança.
 * Loga eventos críticos para detecção de anomalias e compliance.
 * 
 * Em produção, enviar para SIEM (Elastic, Splunk, Datadog, etc.) via log structured (JSON).
 */
@Service
public class AuditService {

    private static final Logger auditLog = LoggerFactory.getLogger("AUDIT");

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
    }

    /** Regista evento de autorização (acesso negado, admin actions). */
    public void logAuthzEvent(String event, String userId, String ip, String resource, boolean allowed) {
        auditLog.info("AUTHZ_EVENT type={} userId={} ip={} resource={} allowed={}",
                event, userId, ip, resource, allowed);
    }

    /** Regista evento de dados sensíveis (alteração de perfil, avatar, endereço). */
    public void logDataEvent(String event, String userId, String ip, String details) {
        auditLog.info("DATA_EVENT type={} userId={} ip={} details={}",
                event, userId, ip, details);
    }

    /** Regista evento de pagamento/pedido. */
    public void logPaymentEvent(String event, String userId, String ip, String orderId, String details) {
        auditLog.info("PAYMENT_EVENT type={} userId={} ip={} orderId={} details={}",
                event, userId, ip, orderId, details);
    }

    /** Regista evento administrativo. */
    public void logAdminEvent(String event, String adminId, String ip, String targetId, String details) {
        auditLog.info("ADMIN_EVENT type={} adminId={} ip={} targetId={} details={}",
                event, adminId, ip, targetId, details);
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

    /** Extrai IP do request (considera proxies). */
    public static String getClientIp(HttpServletRequest request) {
        String xf = request.getHeader("X-Forwarded-For");
        if (xf != null && !xf.isBlank()) {
            return xf.split(",")[0].trim();
        }
        String xr = request.getHeader("X-Real-IP");
        if (xr != null && !xr.isBlank()) {
            return xr;
        }
        return request.getRemoteAddr();
    }

    /** Extrai User-Agent do request. */
    public static String getUserAgent(HttpServletRequest request) {
        return request.getHeader("User-Agent");
    }
}