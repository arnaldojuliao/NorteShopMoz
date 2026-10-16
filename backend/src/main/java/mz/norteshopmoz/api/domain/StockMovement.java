package mz.norteshopmoz.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Movimento de stock — cada alteração de inventário fica registada.
 *
 * <p>Checkout ({@code CHECKOUT}), cancelamento ({@code CANCELAMENTO}) e ajuste
 * manual da operação ({@code AJUSTE_MANUAL}). Sem este histórico, responder a
 * "porque é que o stock deste produto mudou?" era adivinhar entre vendas,
 * cancelamentos e edições diretas ao produto.</p>
 */
@Entity
@Table(name = "stock_movements")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StockMovement {

    public static final String REASON_CHECKOUT = "CHECKOUT";
    public static final String REASON_CANCELLATION = "CANCELAMENTO";
    public static final String REASON_MANUAL = "AJUSTE_MANUAL";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "product_id", nullable = false, length = 40)
    private String productId;

    /** Negativo = saída de stock, positivo = entrada. */
    @Column(nullable = false)
    private int delta;

    /** Stock resultante após o movimento (informativo — ajuda a ler o histórico). */
    @Column(name = "stock_after")
    private Integer stockAfter;

    /** {@link #REASON_CHECKOUT} | {@link #REASON_CANCELLATION} | {@link #REASON_MANUAL}. */
    @Column(nullable = false, length = 40)
    private String reason;

    @Column(length = 300)
    private String detail;

    /** Admin que fez o ajuste manual (null nos movimentos automáticos). */
    @Column(name = "user_id", length = 40)
    private String userId;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
