package mz.norteshopmoz.api.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.math.BigDecimal;
import java.util.List;

/**
 * Payload de criação de pedido (contrato do frontend).
 * Os totais enviados pelo cliente são apenas informativos — o servidor
 * recalcula subtotal e total a partir dos itens (preço × quantidade).
 */
public record OrderRequest(
        @NotEmpty(message = "Pedido sem itens") @Valid List<ItemRequest> items,
        BigDecimal subtotal,
        BigDecimal shipping,
        BigDecimal discount,
        BigDecimal total,
        @Valid AddressRequest address,
        String paymentMethod,
        PaymentInfoRequest paymentInfo) {

    /** Dados de pagamento online (M-Pesa/e-Mola: telefone; cartão: últimos 4 dígitos). */
    public record PaymentInfoRequest(String phone, String cardLast4) {}


    public record ItemRequest(
            String productId,
            String slug,
            String name,
            String image,
            BigDecimal price,
            int qty,
            String variant) {}

    public record AddressRequest(
            @jakarta.validation.constraints.NotBlank(message = "Nome completo é obrigatório") String fullName,
            @jakarta.validation.constraints.NotBlank(message = "Telefone é obrigatório") String phone,
            String email,
            String address,
            String city,
            @jakarta.validation.constraints.NotBlank(message = "Província é obrigatória") String province,
            String notes) {}

    /** Corpo do PATCH /api/orders/{id}/status (rótulo ou nome do enum). */
    public record StatusRequest(
            @jakarta.validation.constraints.NotBlank(message = "Estado é obrigatório") String status) {}
}
