package mz.norteshopmoz.api.web.dto;

import java.util.List;
import java.util.Map;

/**
 * Envelope de resposta do contrato:
 * <pre>
 *   GET  /api/products       → {"data": [...], "meta": {"total": n}}
 *   GET  /api/products/{s}   → {"data": {...}}
 *   POST /api/orders         → {"data": {...}}
 *   Erros                    → {"error": "..."}
 * </pre>
 */
public final class ApiResponse {

    private ApiResponse() {}

    public static <T> Map<String, T> data(T payload) {
        return Map.of("data", payload);
    }

    public static Map<String, Object> list(List<?> payload, long total) {
        return Map.of("data", payload, "meta", Map.of("total", total));
    }

    public static Map<String, String> error(String message) {
        return Map.of("error", message);
    }
}
