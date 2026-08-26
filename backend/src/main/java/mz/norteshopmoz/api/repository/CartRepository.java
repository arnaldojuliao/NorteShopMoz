package mz.norteshopmoz.api.repository;

import mz.norteshopmoz.api.domain.UserCart;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CartRepository extends JpaRepository<UserCart, String> {
}
