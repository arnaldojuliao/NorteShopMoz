package mz.norteshopmoz.api.repository;

import java.util.List;
import java.util.Optional;
import mz.norteshopmoz.api.domain.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

public interface ProductRepository
        extends JpaRepository<Product, String>, JpaSpecificationExecutor<Product> {

    Optional<Product> findBySlug(String slug);

    /** Contagem de produtos por categoria — uma query em vez de N por categoria. */
    @Query("SELECT p.category AS category, COUNT(p) AS cnt FROM Product p GROUP BY p.category")
    List<Object[]> countProductsGroupedByCategory();
}
