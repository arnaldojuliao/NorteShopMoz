package mz.norteshopmoz.api.config;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Fonte única das regras de envio (espelha frontend/src/lib/data/provinces.ts):
 * limite de entrega grátis, taxa e prazo (dias úteis) por província.
 *
 * <p>Centraliza o que antes estava duplicado no {@code OrderService} (taxas) e no
 * {@code EmailService} (prazos) e alimenta o endpoint público {@code GET /api/shipping},
 * para o frontend consumir as mesmas regras (sem duplicação entre camadas).
 */
@Component
public class ShippingConfig {

    /** Entrega grátis acima deste subtotal (MT). */
    public static final BigDecimal FREE_SHIPPING_THRESHOLD = BigDecimal.valueOf(5000);

    public record Province(String name, BigDecimal fee, int[] days) {
        public int minDays() {
            return days[0];
        }

        public int maxDays() {
            return days[1];
        }
    }

    /** Ordem de apresentação (mesma do frontend — a primeira é a predefinida). */
    private static final Map<String, Province> PROVINCES = new LinkedHashMap<>();

    static {
        put("Maputo Cidade", "120", 1, 3);
        put("Maputo Província", "150", 2, 4);
        put("Gaza", "200", 3, 5);
        put("Inhambane", "220", 3, 6);
        put("Sofala", "260", 4, 7);
        put("Manica", "280", 4, 7);
        put("Tete", "320", 5, 8);
        put("Zambézia", "300", 5, 8);
        put("Nampula", "320", 5, 9);
        put("Cabo Delgado", "360", 6, 10);
        put("Niassa", "380", 6, 11);
    }

    private static void put(String name, String fee, int minDays, int maxDays) {
        PROVINCES.put(name, new Province(name, new BigDecimal(fee), new int[] {minDays, maxDays}));
    }

    public boolean isValidProvince(String name) {
        return name != null && PROVINCES.containsKey(name);
    }

    /** Taxa de envio da província (null se desconhecida). */
    public BigDecimal feeFor(String name) {
        Province p = PROVINCES.get(name);
        return p == null ? null : p.fee();
    }

    /** Prazo de entrega em dias úteis (null se desconhecida). */
    public int[] daysFor(String name) {
        Province p = PROVINCES.get(name);
        return p == null ? null : p.days();
    }

    public Province defaultProvince() {
        return PROVINCES.values().iterator().next();
    }

    /** Lista pública (para o endpoint /api/shipping). */
    public List<Province> provinces() {
        return List.copyOf(PROVINCES.values());
    }
}
