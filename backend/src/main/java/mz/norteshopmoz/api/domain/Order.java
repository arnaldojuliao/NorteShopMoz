package mz.norteshopmoz.api.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.Fetch;
import org.hibernate.annotations.FetchMode;

/**
 * Pedido — espelha o contrato Order do frontend.
 * (id, date, items, subtotal, shipping, discount, total, status, address, paymentMethod)
 */
@Entity
@Table(name = "orders")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Order {

    @Id
    @Column(length = 40)
    private String id;

    @Column(nullable = false, updatable = false)
    private Instant date;

    /** Utilizador autenticado que fez o pedido (nullable até a autenticação estar ligada). */
    @Column(length = 40)
    private String userId;

    // `@Fetch(SUBSELECT)` (e não um JOIN EAGER): as listagens paginadas
    // (admin e histórico) não podem participar num join de coleção, ou o
    // Hibernate aplica o LIMIT em memória e carrega a tabela de pedidos inteira —
    // sintoma clássico de memória a crescer sem limite com o histórico. Com
    // SUBSELECT, a página é cortada no SQL e a coleção é carregada com um único
    // SELECT adicional por página (em vez de N+1), mantendo-se EAGER para a
    // serialização não precisar de sessão aberta.
    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JoinColumn(name = "order_id", nullable = false)
    @OrderColumn(name = "position")
    @Fetch(FetchMode.SUBSELECT)
    @Builder.Default
    private List<OrderItem> items = new ArrayList<>();

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal subtotal;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal shipping;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal discount;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal total;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private OrderStatus status;

    @Embedded
    private OrderAddress address;

    /** Código promocional aplicado, se existir. */
    @Column(length = 40)
    private String couponCode;

    @Column(nullable = false, length = 80)
    private String paymentMethod;

    /** Referência da cobrança online (M-Pesa/e-Mola/cartão) — null se pago na entrega/transferência. */
    @Column(length = 80)
    private String paymentReference;

    /**
     * Código de rastreamento do envio (definido pela operação quando o pedido
     * avança para "Enviado"/"Em trânsito" — ex.: número da transportadora).
     * Aparece na página de acompanhamento do cliente.
     */
    @Column(length = 80)
    private String trackingCode;

    /**
     * URL da página de pagamento do provedor (PaySuite ou página simulada), quando
     * o pedido exige que o cliente pague fora da loja.
     *
     * <p>{@code @Transient} de propósito: é um dado de <em>trânsito</em>, válido
     * apenas na resposta que cria o pedido — não faz sentido guardar no histórico
     * um URL de checkout que expira, e os pedidos lidos da base de dados nunca o
     * trazem (fica null). Nota: o {@code save()} de entidade com id atribuído faz
     * {@code merge()} e devolve uma instância sem este campo — quem devolve o
     * pedido na resposta repõe-o (ver OrderService.createOrder).</p>
     */
    @Transient
    private String checkoutUrl;
}
