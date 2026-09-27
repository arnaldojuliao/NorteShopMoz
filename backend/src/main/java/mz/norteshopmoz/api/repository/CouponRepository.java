package mz.norteshopmoz.api.repository;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import mz.norteshopmoz.api.domain.Coupon;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CouponRepository extends JpaRepository<Coupon, Long> {
    Optional<Coupon> findByCodeIgnoreCase(String code);
    List<Coupon> findAllByOrderByIdDesc();

    /**
     * Igual a {@link #findByCodeIgnoreCase(String)} mas com lock de escrita —
     * usado ao consumir o cupão para serializar pedidos simultâneos e não
     * ultrapassar o limite de utilizações.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Coupon c where upper(c.code) = upper(:code)")
    Optional<Coupon> findByCodeForUpdate(@Param("code") String code);
}
