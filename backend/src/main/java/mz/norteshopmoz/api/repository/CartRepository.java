package mz.norteshopmoz.api.repository;

import java.time.Instant;
import mz.norteshopmoz.api.domain.UserCart;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CartRepository extends JpaRepository<UserCart, String> {

    /**
     * Apaga em massa os carrinhos de convidado ({@code userId} com o prefixo
     * {@code guest:}) sem atividade desde {@code cutoff}. Uma só instrução SQL,
     * em vez de carregar as linhas todas para memória — é o que torna o expurgo
     * seguro numa base grande.
     */
    @Modifying(clearAutomatically = true)
    @Query("delete from UserCart c where c.userId like :prefix and c.updatedAt < :cutoff")
    int deleteGuestCartsOlderThan(@Param("prefix") String prefix, @Param("cutoff") Instant cutoff);

    /**
     * Teto do número de carrinhos de convidado: apaga os mais antigos quando o
     * total excede {@code max} (mais recentes primeiro ficam).
     *
     * <p>O expurgo por idade não trava o abuso: {@code PUT /api/cart} é público e
     * a chave ({@code X-Guest-Id}) é escolhida pelo cliente, pelo que cada id novo
     * cria uma linha — um atacante gera centenas de milhares por dia. Com este
     * teto a tabela tem um limite superior <strong>absoluto</strong>, independente
     * da idade do abuso, e a base de dados nunca enche por este caminho.</p>
     *
     * <p>Os carrinhos de conta nunca são tocados ({@code not like 'guest:%'}).</p>
     */
    @Modifying(clearAutomatically = true)
    @Query(value = "delete from user_carts where user_id like :prefix and user_id not in ("
            + "select user_id from user_carts where user_id like :prefix "
            + "order by updated_at desc limit :max)", nativeQuery = true)
    int deleteGuestCartsBeyondMax(@Param("prefix") String prefix, @Param("max") int max);

    /**
     * Carrinhos de conta cujo dono já não existe. Exclui os de convidado
     * ({@code guest:}), que são geridos pelo {@code GuestCartCleanup} pela idade.
     */
    @Modifying(clearAutomatically = true)
    @Query("delete from UserCart c where c.userId not like 'guest:%' "
            + "and c.userId not in (select u.id from UserAccount u)")
    int deleteOrphanAccountCarts();
}
