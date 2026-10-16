package mz.norteshopmoz.api.repository;

import java.util.List;
import mz.norteshopmoz.api.domain.StockMovement;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StockMovementRepository extends JpaRepository<StockMovement, Long> {

    List<StockMovement> findByProductIdOrderByCreatedAtDesc(String productId, Pageable pageable);

    List<StockMovement> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
