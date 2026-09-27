package mz.norteshopmoz.api.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;

/**
 * Payload de criação de pedido (contrato do frontend).
 * Os totais enviados pelo cliente são apenas informativos — o servidor
 * recalcula subtotal e total a partir dos itens (preço × quantidade).
 *
 * <p><strong>Limites de tamanho</strong>: este endpoint é público (guest checkout)
 * e cada item despoleta várias leituras do catálogo no servidor — sem um teto na
 * lista, um único pedido com milhares de itens multiplicava as queries (DoS por
 * amplificação) e estourava o pool de ligações. 50 itens já cobre qualquer carrinho
 * real; o frontend nunca envia mais. Os campos de texto têm o tamanho das colunas
 * — sem isto, um campo longo rebentava com 500 (overflow de VARCHAR) em vez de 400.</p>
 */
public record OrderRequest(
        @NotEmpty(message = "Pedido sem itens")
        @Size(max = 50, message = "Máximo de 50 itens por pedido")
        @Valid List<ItemRequest> items,
        BigDecimal subtotal,
        BigDecimal shipping,
        BigDecimal discount,
        BigDecimal total,
        @Valid AddressRequest address,
        @Size(max = 80, message = "Método de pagamento demasiado longo")
        String paymentMethod,
        @Valid PaymentInfoRequest paymentInfo,
        /** Código do cupão aplicado no checkout (opcional) — revalidado no servidor. */
        @Size(max = 40, message = "Código de cupão demasiado longo")
        String couponCode) {

    /** Dados de pagamento online (M-Pesa/e-Mola: telefone; cartão: últimos 4 dígitos). */
    public record PaymentInfoRequest(
            @Size(max = 20, message = "Telefone demasiado longo") String phone,
            @Size(max = 4, message = "Use apenas os últimos 4 dígitos do cartão") String cardLast4) {}

    public record ItemRequest(
            @Size(max = 40, message = "Identificador de produto demasiado longo") String productId,
            @Size(max = 120, message = "Slug demasiado longo") String slug,
            @Size(max = 200, message = "Nome demasiado longo") String name,
            @Size(max = 500, message = "URL de imagem demasiado longo") String image,
            @DecimalMin(value = "0", message = "Preço inválido") BigDecimal price,
            int qty,
            @Size(max = 60, message = "Variante demasiado longa") String variant) {}

    public record AddressRequest(
            @NotBlank(message = "Nome completo é obrigatório")
            @Size(max = 120, message = "Nome completo demasiado longo") String fullName,
            @NotBlank(message = "Telefone é obrigatório")
            @Size(max = 40, message = "Telefone demasiado longo") String phone,
            @Size(max = 150, message = "Email demasiado longo") String email,
            @Size(max = 300, message = "Morada demasiado longa") String address,
            @Size(max = 80, message = "Cidade demasiado longa") String city,
            @NotBlank(message = "Província é obrigatória")
            @Size(max = 80, message = "Província demasiado longa") String province,
            @Size(max = 500, message = "Notas demasiado longas") String notes) {}

    /** Corpo do PATCH /api/orders/{id}/status (rótulo ou nome do enum). */
    public record StatusRequest(
            @NotBlank(message = "Estado é obrigatório") String status) {}
}
