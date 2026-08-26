package mz.norteshopmoz.api.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Optional;

/** Estado do pedido — serializado com os rótulos em português do contrato do frontend. */
public enum OrderStatus {
    PEDIDO_RECEBIDO("Pedido recebido"),
    PAGAMENTO_CONFIRMADO("Pagamento confirmado"),
    EM_PREPARACAO("Em preparação"),
    ENVIADO("Enviado"),
    EM_TRANSITO("Em trânsito"),
    ENTREGUE("Entregue");

    private final String label;

    OrderStatus(String label) {
        this.label = label;
    }

    @JsonValue
    public String getLabel() {
        return label;
    }

    /** Resolve pelo rótulo português ou pelo nome do enum (case-insensitive). */
    public static Optional<OrderStatus> fromLabel(String value) {
        if (value == null) {
            return Optional.empty();
        }
        String trimmed = value.trim();
        for (OrderStatus s : values()) {
            if (s.label.equalsIgnoreCase(trimmed) || s.name().equalsIgnoreCase(trimmed)) {
                return Optional.of(s);
            }
        }
        return Optional.empty();
    }
}
