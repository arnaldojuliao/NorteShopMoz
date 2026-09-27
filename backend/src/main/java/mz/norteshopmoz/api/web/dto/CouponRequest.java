package mz.norteshopmoz.api.web.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;

public record CouponRequest(
        @NotBlank String code,
        @DecimalMin("0.01") BigDecimal discountValue,
        String discountType,
        BigDecimal minimumSubtotal,
        java.time.Instant expiresAt,
        Boolean active,
        Integer usageLimit) {}
