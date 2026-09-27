package mz.norteshopmoz.api.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import mz.norteshopmoz.api.domain.Coupon;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.CouponRepository;
import mz.norteshopmoz.api.web.dto.CouponRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CouponService {
    private final CouponRepository repository;

    public CouponService(CouponRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public Coupon validate(String rawCode, BigDecimal subtotal) {
        String code = normalize(rawCode);
        Coupon coupon = repository.findByCodeIgnoreCase(code)
                .orElseThrow(() -> ApiException.badRequest("Cupão inválido ou inexistente"));
        if (!coupon.isActive() || (coupon.getExpiresAt() != null && coupon.getExpiresAt().isBefore(Instant.now()))) {
            throw ApiException.badRequest("Este cupão está expirado ou inativo");
        }
        if (coupon.getUsageLimit() > 0 && coupon.getUsedCount() >= coupon.getUsageLimit()) {
            throw ApiException.badRequest("Este cupão já atingiu o limite de utilizações");
        }
        BigDecimal base = subtotal == null ? BigDecimal.ZERO : subtotal;
        if (coupon.getMinimumSubtotal() != null && base.compareTo(coupon.getMinimumSubtotal()) < 0) {
            throw ApiException.badRequest("O subtotal mínimo para este cupão é " + coupon.getMinimumSubtotal() + " MT");
        }
        return coupon;
    }

    @Transactional(readOnly = true)
    public BigDecimal calculate(Coupon coupon, BigDecimal subtotal) {
        BigDecimal base = subtotal == null ? BigDecimal.ZERO : subtotal;
        BigDecimal discount = "PERCENT".equalsIgnoreCase(coupon.getDiscountType())
                ? base.multiply(coupon.getDiscountValue()).divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP)
                : coupon.getDiscountValue();
        return discount.min(base).max(BigDecimal.ZERO);
    }

    @Transactional
    public void consume(String code) {
        // Lock de escrita: revalida o limite já dentro da transação do pedido,
        // para dois checkouts simultâneos não ultrapassarem o usageLimit.
        Coupon coupon = repository.findByCodeForUpdate(normalize(code))
                .orElseThrow(() -> ApiException.badRequest("Cupão inválido"));
        if (coupon.getUsageLimit() > 0 && coupon.getUsedCount() >= coupon.getUsageLimit()) {
            throw ApiException.badRequest("Este cupão já atingiu o limite de utilizações");
        }
        coupon.setUsedCount(coupon.getUsedCount() + 1);
        repository.save(coupon);
    }

    @Transactional(readOnly = true)
    public List<Coupon> list() { return repository.findAllByOrderByIdDesc(); }

    @Transactional
    public Coupon create(CouponRequest request) {
        String code = normalize(request.code());
        if (repository.findByCodeIgnoreCase(code).isPresent()) throw ApiException.conflict("Já existe um cupão com esse código");
        return repository.save(Coupon.builder().code(code).discountValue(request.discountValue())
                .discountType(type(request.discountType())).minimumSubtotal(request.minimumSubtotal())
                .expiresAt(request.expiresAt()).active(request.active() == null || request.active())
                .usageLimit(request.usageLimit() == null ? 0 : Math.max(0, request.usageLimit())).build());
    }

    @Transactional
    public Coupon update(Long id, CouponRequest request) {
        Coupon coupon = repository.findById(id).orElseThrow(() -> ApiException.notFound("Cupão não encontrado"));
        coupon.setCode(normalize(request.code()));
        coupon.setDiscountValue(request.discountValue());
        coupon.setDiscountType(type(request.discountType()));
        coupon.setMinimumSubtotal(request.minimumSubtotal());
        coupon.setExpiresAt(request.expiresAt());
        if (request.active() != null) coupon.setActive(request.active());
        if (request.usageLimit() != null) coupon.setUsageLimit(Math.max(0, request.usageLimit()));
        return repository.save(coupon);
    }

    @Transactional
    public void delete(Long id) {
        if (!repository.existsById(id)) throw ApiException.notFound("Cupão não encontrado");
        repository.deleteById(id);
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank()) throw ApiException.badRequest("Código do cupão é obrigatório");
        return value.trim().toUpperCase(Locale.ROOT);
    }
    private static String type(String value) {
        String result = value == null ? "PERCENT" : value.trim().toUpperCase(Locale.ROOT);
        if (!result.equals("PERCENT") && !result.equals("FIXED")) throw ApiException.badRequest("Tipo de desconto inválido");
        return result;
    }
}
