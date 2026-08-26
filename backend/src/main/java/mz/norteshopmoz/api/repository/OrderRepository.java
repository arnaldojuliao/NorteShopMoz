package mz.norteshopmoz.api.repository;

import java.util.List;
import mz.norteshopmoz.api.domain.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrderRepository extends JpaRepository<Order, String> {

    List<Order> findByUserIdOrderByDateDesc(String userId);

    List<Order> findAllByOrderByDateDesc();

    List<Order> findTop10ByOrderByDateDesc();

    /** O utilizador já comprou este produto? (para o selo "Compra verificada"). */
    @Query("select case when count(o) > 0 then true else false end "
            + "from Order o join o.items i where o.userId = :userId and i.productId = :productId")
    boolean hasOrderedProduct(@Param("userId") String userId, @Param("productId") String productId);
}
