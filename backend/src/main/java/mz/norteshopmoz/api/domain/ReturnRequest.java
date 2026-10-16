package mz.norteshopmoz.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Pedido de devolução de um pedido entregue.
 *
 * <p>Ciclo: PEDIDO (cliente pediu, com motivo) → APROVADA (a operação aprovou e
 * o estorno foi tentado) → REEMBOLSADA (dinheiro devolvido) — ou REJEITADA
 * (fora da janela de 7 dias, produto usado, etc.). Rejeitar é final: quem
 * discorda fala com o suporte.</p>
 */
@Entity
@Table(name = "return_requests")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReturnRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id", nullable = false, length = 40, unique = true)
    private String orderId;

    /** Dono do pedido (null em pedidos de convidado — o motivo e o contacto ficam no pedido). */
    @Column(name = "user_id", length = 40)
    private String userId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String reason;

    /** PEDIDO | APROVADA | REJEITADA | REEMBOLSADA. */
    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = "PEDIDO";

    /** Nota da operação (ex.: motivo da rejeição) — opcional. */
    @Column(name = "admin_note", length = 500)
    private String adminNote;

    /** Valor efetivamente reembolsado (quando aprovado). */
    @Column(name = "refund_amount", precision = 12, scale = 2)
    private BigDecimal refundAmount;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();

    public boolean isTerminal() {
        return "REJEITADA".equalsIgnoreCase(status) || "REEMBOLSADA".equalsIgnoreCase(status);
    }
}
