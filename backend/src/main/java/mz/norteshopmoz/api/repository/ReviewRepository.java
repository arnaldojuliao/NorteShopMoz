package mz.norteshopmoz.api.repository;

import java.util.List;
import mz.norteshopmoz.api.domain.Review;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReviewRepository extends JpaRepository<Review, Long> {

    List<Review> findByProductIdOrderByDateDesc(String productId);

    long countByProductId(String productId);
}
