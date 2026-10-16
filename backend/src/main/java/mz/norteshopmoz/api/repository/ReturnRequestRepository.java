package mz.norteshopmoz.api.repository;

import java.util.List;
import java.util.Optional;
import mz.norteshopmoz.api.domain.ReturnRequest;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReturnRequestRepository extends JpaRepository<ReturnRequest, Long> {

    Optional<ReturnRequest> findByOrderId(String orderId);

    List<ReturnRequest> findByUserIdOrderByCreatedAtDesc(String userId);

    List<ReturnRequest> findAllByOrderByCreatedAtDesc();

    List<ReturnRequest> findByStatusOrderByCreatedAtDesc(String status);
}
