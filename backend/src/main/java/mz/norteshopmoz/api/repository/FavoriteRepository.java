package mz.norteshopmoz.api.repository;

import java.util.List;
import mz.norteshopmoz.api.domain.Favorite;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FavoriteRepository extends JpaRepository<Favorite, Favorite.FavoriteId> {

    List<Favorite> findByUserIdOrderByProductId(String userId);

    @Modifying
    @Query("DELETE FROM Favorite f WHERE f.userId = :userId")
    void deleteByUserId(@Param("userId") String userId);

    /**
     * Apaga favoritos cujo dono já não existe. Uma conta removida da base de
     * dados (manutenção) deixava estas linhas órfãs — invisíveis para qualquer
     * utilizador, mas a ocupar espaço e a aparecer em contagens.
     */
    @Modifying(clearAutomatically = true)
    @Query("delete from Favorite f where f.userId not in (select u.id from UserAccount u)")
    int deleteOrphans();
}
