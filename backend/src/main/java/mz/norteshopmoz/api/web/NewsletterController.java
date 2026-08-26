package mz.norteshopmoz.api.web;

import java.util.Map;
import mz.norteshopmoz.api.domain.NewsletterSubscriber;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.NewsletterService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Newsletter — subscrição pública e lista de subscritores (admin). */
@RestController
@RequestMapping("/api/newsletter")
public class NewsletterController {

    private final NewsletterService newsletterService;

    public NewsletterController(NewsletterService newsletterService) {
        this.newsletterService = newsletterService;
    }

    /** POST /api/newsletter/subscribe — público, idempotente por email. */
    @PostMapping("/subscribe")
    public ResponseEntity<?> subscribe(@RequestBody SubscribeRequest request) {
        NewsletterSubscriber subscriber =
                newsletterService.subscribe(request.email(), request.name());
        return ResponseEntity.ok(ApiResponse.data(Map.of(
                "email", subscriber.getEmail(),
                "active", subscriber.isActive())));
    }

    /** GET /api/newsletter/subscribers — lista todos (apenas admin). */
    @GetMapping("/subscribers")
    public ResponseEntity<?> subscribers(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
        if (!"ADMIN".equalsIgnoreCase(principal.role())) {
            throw ApiException.forbidden("Apenas administradores podem listar subscritores");
        }
        return ResponseEntity.ok(ApiResponse.data(newsletterService.listAll()));
    }

    public record SubscribeRequest(String email, String name) {}
}
