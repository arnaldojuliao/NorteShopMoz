package mz.norteshopmoz.api.repository;

import java.util.List;
import mz.norteshopmoz.api.domain.AddressBookEntry;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AddressRepository extends JpaRepository<AddressBookEntry, Long> {

    List<AddressBookEntry> findByUserIdOrderByCreatedAtAsc(String userId);

    void deleteByUserId(String userId);
}
