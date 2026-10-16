package mz.norteshopmoz.api.repository;

import java.util.List;
import mz.norteshopmoz.api.domain.PaymentIncident;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentIncidentRepository extends JpaRepository<PaymentIncident, Long> {

    List<PaymentIncident> findByStatusOrderByCreatedAtDesc(String status);

    List<PaymentIncident> findAllByOrderByCreatedAtDesc();

    boolean existsByOrderIdAndIncidentTypeAndStatus(String orderId, String incidentType, String status);
}
