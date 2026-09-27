package mz.norteshopmoz.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import mz.norteshopmoz.api.domain.NewsletterSubscriber;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.NewsletterRepository;
import org.junit.jupiter.api.Test;

/**
 * A subscrição da newsletter envia um email de boas-vindas para o endereço
 * indicado pelo pedido, sem exigir conta — é um dos endpoints públicos que
 * queimam a cota do fornecedor e a reputação do domínio se não tiverem travão.
 * Estes testes garantem que passa pelo {@link EmailThrottleService}.
 */
class NewsletterServiceTest {

    private final NewsletterRepository repository = mock(NewsletterRepository.class);
    private final EmailService emailService = mock(EmailService.class);
    private final EmailThrottleService throttle = mock(EmailThrottleService.class);

    private NewsletterService service() {
        return new NewsletterService(repository, emailService, throttle);
    }

    @Test
    void novoSubscritorPassaPeloTravaoDeEmail() {
        when(repository.findByEmail(anyString())).thenReturn(Optional.empty());
        when(repository.save(any(NewsletterSubscriber.class))).thenAnswer(i -> i.getArgument(0));

        NewsletterSubscriber saved = service().subscribe("Novo@Exemplo.com", "Ana");

        // Email normalizado (minúsculas) antes de ir ao travão/BD.
        assertThat(saved.getEmail()).isEqualTo("novo@exemplo.com");
        verify(throttle).assertAllowed("novo@exemplo.com");
        verify(throttle).recordSent("novo@exemplo.com");
        verify(emailService).sendNewsletterWelcome(any(NewsletterSubscriber.class));
    }

    @Test
    void travaoDeEmailBloqueiaAntesDeGravar() {
        when(repository.findByEmail(anyString())).thenReturn(Optional.empty());
        doThrow(ApiException.tooManyRequests("limite de emails públicos"))
                .when(throttle).assertAllowed(anyString());

        assertThatThrownBy(() -> service().subscribe("spam@exemplo.com", null))
                .isInstanceOf(ApiException.class);

        // Recusado ANTES de criar a linha e antes de gastar o envio.
        verify(repository, never()).save(any(NewsletterSubscriber.class));
        verify(emailService, never()).sendNewsletterWelcome(any(NewsletterSubscriber.class));
    }

    @Test
    void subscritorExistenteNaoEnviaEmailNemGastaQuota() {
        NewsletterSubscriber existing = NewsletterSubscriber.builder()
                .email("viva@exemplo.com")
                .active(true)
                .build();
        when(repository.findByEmail("viva@exemplo.com")).thenReturn(Optional.of(existing));

        service().subscribe("viva@exemplo.com", null);

        // Idempotente: sem email novo, não conta para o travão.
        verify(throttle, never()).assertAllowed(anyString());
        verify(emailService, never()).sendNewsletterWelcome(any(NewsletterSubscriber.class));
    }
}
