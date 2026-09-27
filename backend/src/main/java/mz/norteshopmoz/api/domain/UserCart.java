package mz.norteshopmoz.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Carrinho de um utilizador — uma linha por conta, itens em JSONB.
 *
 * <p>Inclui também os carrinhos de <strong>convidado</strong> (chave
 * {@code guest:<uuid>}). Esses não pertencem a nenhuma conta e nunca expiravam:
 * cada dispositivo/valor novo do header criava uma linha permanente. O carimbo
 * {@code updatedAt} existe para o {@code GuestCartCleanup} os expurgar depois de
 * um período de inatividade (ver {@code app.cart.guest-retention-days}).</p>
 */
@Entity
@Table(name = "user_carts")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserCart {

    // 64: a chave de convidado é "guest:" + UUID (42 chars) — 40 era curto demais
    // e o PUT /api/cart de convidados falhava com 500 (value too long).
    @Id
    @Column(length = 64)
    private String userId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    @Builder.Default
    private List<CartItem> items = new ArrayList<>();

    /** Última escrita do carrinho (usada para expurgar carrinhos de convidado). */
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    @PreUpdate
    void touch() {
        this.updatedAt = Instant.now();
    }
}
