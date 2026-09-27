package mz.norteshopmoz.api.repository;

import java.util.List;
import java.util.Optional;
import mz.norteshopmoz.api.domain.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository
        extends JpaRepository<Product, String>, JpaSpecificationExecutor<Product> {

    Optional<Product> findBySlug(String slug);

    /**
     * Decrementa o stock e incrementa o contador de vendas num único UPDATE
     * condicional — atómico e imune a leituras obsoletas (o padrão
     * ler-modificar-escrever vendia a última unidade duas vezes em checkouts
     * concorrentes). Devolve 0 se o produto não existir ou não tiver stock
     * suficiente, e nesse caso o pedido é rejeitado.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Product p set p.stock = p.stock - :qty, p.sold = p.sold + :qty "
            + "where p.id = :id and p.stock >= :qty")
    int decrementStockAndSold(@Param("id") String id, @Param("qty") int qty);

    /**
     * Repõe stock e vendas num cancelamento (atómico). Devolve 0 se o produto
     * já não existir.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Product p set p.stock = p.stock + :qty, "
            + "p.sold = case when p.sold >= :qty then p.sold - :qty else 0 end where p.id = :id")
    int restoreStockAndSold(@Param("id") String id, @Param("qty") int qty);

    /**
     * Produtos sem carimbo de criação — catálogos anteriores à coluna
     * {@code created_at}. Usado pelo {@code DataSeeder} para os preencher (uma
     * só vez por base de dados).
     */
    List<Product> findByCreatedAtIsNull();

    /** Contagem de produtos por categoria — uma query em vez de N por categoria. */
    @Query("SELECT p.category AS category, COUNT(p) AS cnt FROM Product p GROUP BY p.category")
    List<Object[]> countProductsGroupedByCategory();
}
