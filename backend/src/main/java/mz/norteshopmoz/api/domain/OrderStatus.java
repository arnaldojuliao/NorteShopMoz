package mz.norteshopmoz.api.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Optional;

/**
 * Estado do pedido — serializado com os rótulos em português do contrato do
 * frontend.
 *
 * <p>A ordem de declaração é significativa: as transições ({@code OrderService})
 * e a confirmação por webhook comparam {@code ordinal()}, pelo que um estado
 * novo só pode ser inserido respeitando a progressão real do pedido.</p>
 */
public enum OrderStatus {
    /**
     * Pagamento online criado mas ainda não confirmado (checkout hospedado da
     * PaySuite): o cliente foi redirecionado para pagar e o pedido só avança
     * quando chega a notificação assinada. Antes, o pedido nascia já em
     * "Pagamento confirmado" — marcava como pago algo que ainda podia falhar ou
     * nunca chegar a ser pago.
     */
    AGUARDA_PAGAMENTO("Aguarda pagamento"),
    PEDIDO_RECEBIDO("Pedido recebido"),
    PAGAMENTO_CONFIRMADO("Pagamento confirmado"),
    EM_PREPARACAO("Em preparação"),
    ENVIADO("Enviado"),
    EM_TRANSITO("Em trânsito"),
    ENTREGUE("Entregue"),
    CANCELADO("Cancelado");

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
