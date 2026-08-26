package mz.norteshopmoz.api.repository;

import java.util.List;
import java.util.Optional;
import mz.norteshopmoz.api.domain.NewsletterSubscriber;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NewsletterRepository extends JpaRepository<NewsletterSubscriber, Long> {

    Optional<NewsletterSubscriber> findByEmail(String email);

    List<NewsletterSubscriber> findAllByOrderBySubscribedAtDesc();
}
