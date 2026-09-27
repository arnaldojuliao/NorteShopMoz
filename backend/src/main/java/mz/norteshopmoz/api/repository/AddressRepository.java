package mz.norteshopmoz.api.repository;

import java.util.List;
import mz.norteshopmoz.api.domain.AddressBookEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface AddressRepository extends JpaRepository<AddressBookEntry, Long> {

    List<AddressBookEntry> findByUserIdOrderByCreatedAtAsc(String userId);

    void deleteByUserId(String userId);

    /** Moradas cujo dono já não existe (ver FavoriteRepository.deleteOrphans). */
    @Modifying(clearAutomatically = true)
    @Query("delete from AddressBookEntry a where a.userId not in (select u.id from UserAccount u)")
    int deleteOrphans();
}
