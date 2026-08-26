package mz.norteshopmoz.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Carrinho de um utilizador — uma linha por conta, itens em JSONB. */
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
}
