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
 * Incidência de pagamento — falha que exige decisão da operação.
 *
 * <p>Antes, um {@code payment.failed} recebido por webhook e um estorno que
 * falhava ficavam apenas no log: invisíveis para quem não olha para os logs,
 * e sem forma de "fechar o caso". Esta tabela é a fila de trabalho da
 * reconciliação — cada linha é um caso aberto até alguém o resolver no painel
 * (marca como resolvido ou tenta o estorno de novo).</p>
 */
@Entity
@Table(name = "payment_incidents")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentIncident {

    /** Tipos de incidência. */
    public static final String TYPE_WEBHOOK_FAILED = "WEBHOOK_FAILED";
    public static final String TYPE_REFUND_FAILED = "REFUND_FAILED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id", nullable = false, length = 40)
    private String orderId;

    @Column(name = "payment_reference", length = 80)
    private String paymentReference;

    /** {@link #TYPE_WEBHOOK_FAILED} ou {@link #TYPE_REFUND_FAILED}. */
    @Column(nullable = false, length = 30)
    private String incidentType;

    @Column(columnDefinition = "TEXT")
    private String detail;

    /** ABERTA | RESOLVIDA. */
    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = "ABERTA";

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "resolved_by", length = 40)
    private String resolvedBy;

    /** Nota escrita ao resolver o caso (o que foi feito no painel do provedor). */
    @Column(name = "resolution_note", length = 500)
    private String resolutionNote;

    public boolean isOpen() {
        return "ABERTA".equalsIgnoreCase(status);
    }
}
