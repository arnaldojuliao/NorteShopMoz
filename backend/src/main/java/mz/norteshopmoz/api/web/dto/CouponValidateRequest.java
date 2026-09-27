package mz.norteshopmoz.api.web.dto;

import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;

/**
 * Pedido de validação de cupão (checkout/carrinho).
 * O subtotal é calculado no cliente apenas para avaliação do mínimo — o
 * desconto final é sempre recalculado no servidor ao criar o pedido.
 */
public record CouponValidateRequest(
        @NotBlank(message = "Código do cupão é obrigatório") String code,
        BigDecimal subtotal) {}
