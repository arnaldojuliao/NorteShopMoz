package mz.norteshopmoz.api.service;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import mz.norteshopmoz.api.domain.NewsletterSubscriber;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.NewsletterRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Subscrição da newsletter — idempotente por email, com email de boas-vindas. */
@Service
public class NewsletterService {

    /** Validação simples de email (formato básico, sem dependências). */
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private final NewsletterRepository repository;
    private final EmailService emailService;

    public NewsletterService(NewsletterRepository repository, EmailService emailService) {
        this.repository = repository;
        this.emailService = emailService;
    }

    /**
     * Subscreve um email. Idempotente: subscrições repetidas devolvem a existente
     * (e reativam se estiver inativa). Email inválido → 400.
     */
    @Transactional
    public NewsletterSubscriber subscribe(String email, String name) {
        if (email == null || !EMAIL_PATTERN.matcher(email.trim()).matches()) {
            throw ApiException.badRequest("Endereço de email inválido");
        }
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        NewsletterSubscriber existing = repository.findByEmail(normalized).orElse(null);
        if (existing != null) {
            if (!existing.isActive()) {
                existing.setActive(true);
                existing.setName(name != null && !name.isBlank() ? name.trim() : existing.getName());
                return repository.save(existing);
            }
            return existing;
        }

        NewsletterSubscriber subscriber = NewsletterSubscriber.builder()
                .email(normalized)
                .name(name != null && !name.isBlank() ? name.trim() : null)
                .subscribedAt(Instant.now())
                .active(true)
                .build();
        NewsletterSubscriber saved = repository.save(subscriber);
        // Boas-vindas (assíncrono — nunca bloqueia a subscrição).
        emailService.sendNewsletterWelcome(saved);
        return saved;
    }

    /** Lista de subscritores, do mais recente ao mais antigo (admin). */
    @Transactional(readOnly = true)
    public List<NewsletterSubscriber> listAll() {
        return repository.findAllByOrderBySubscribedAtDesc();
    }
}
