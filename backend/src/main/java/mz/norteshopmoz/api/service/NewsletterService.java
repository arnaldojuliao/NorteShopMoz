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
    private final EmailThrottleService emailThrottle;

    public NewsletterService(NewsletterRepository repository, EmailService emailService,
            EmailThrottleService emailThrottle) {
        this.repository = repository;
        this.emailService = emailService;
        this.emailThrottle = emailThrottle;
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

        // Travão dos emails públicos: esta subscrição envia um email de boas-vindas
        // para um endereço indicado pelo próprio pedido, sem exigir conta — sem
        // limite, um script com uma lista de endereços queima a cota do fornecedor
        // (os clientes reais deixam de receber a confirmação do pedido) e suja a
        // reputação do domínio, além de encher a tabela de subscritores. Ver
        // EmailThrottleService (só conta emails que acontecem).
        emailThrottle.assertAllowed(normalized);

        NewsletterSubscriber subscriber = NewsletterSubscriber.builder()
                .email(normalized)
                .name(name != null && !name.isBlank() ? name.trim() : null)
                .subscribedAt(Instant.now())
                .active(true)
                .build();
        NewsletterSubscriber saved = repository.save(subscriber);
        emailThrottle.recordSent(saved.getEmail());
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
