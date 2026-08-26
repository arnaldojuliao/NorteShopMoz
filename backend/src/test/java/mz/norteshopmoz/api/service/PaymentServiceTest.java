package mz.norteshopmoz.api.service;

import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.web.dto.OrderRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Testes unitários do {@link PaymentService} — resolução de métodos e
 * comportamento quando não existe gateway configurado (modo 'live' sem
 * implementação): a app arranca, mas pagamentos online devolvem 503 claro.
 */
class PaymentServiceTest {

    @SuppressWarnings("unchecked")
    private static ObjectProvider<PaymentGateway> provider(PaymentGateway gateway) {
        ObjectProvider<PaymentGateway> mock = mock(ObjectProvider.class);
        when(mock.getIfAvailable()).thenReturn(gateway);
        return mock;
    }

    private final PaymentService service = new PaymentService(provider(null));

    @Test
    void resolve_acceptsLabelAndAliases_caseInsensitive() {
        assertThat(service.resolve("M-Pesa")).map(PaymentService.PaymentMethodInfo::id).contains("mpesa");
        assertThat(service.resolve("MPESA")).map(PaymentService.PaymentMethodInfo::id).contains("mpesa");
        assertThat(service.resolve("emola")).map(PaymentService.PaymentMethodInfo::id).contains("emola");
        assertThat(service.resolve("Cash on delivery")).map(PaymentService.PaymentMethodInfo::id).contains("cod");
        assertThat(service.resolve("metodo-inexistente")).isEmpty();
        assertThat(service.resolve(null)).isEmpty();
    }

    @Test
    void authorize_offlineMethod_doesNotTouchGateway() {
        PaymentGateway gateway = mock(PaymentGateway.class);
        PaymentService withGateway = new PaymentService(provider(gateway));
        PaymentService.PaymentMethodInfo cod = service.resolve("cod").orElseThrow();

        assertThat(withGateway.authorize(cod, null)).isNull();
        verify(gateway, never()).charge(anyString(), anyString(), anyString());
    }

    @Test
    void authorize_onlineWithoutGateway_throws503() {
        PaymentService.PaymentMethodInfo mpesa = service.resolve("mpesa").orElseThrow();
        OrderRequest.PaymentInfoRequest info = new OrderRequest.PaymentInfoRequest("841234567", null);

        assertThatThrownBy(() -> service.authorize(mpesa, info))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("indispon")
                .extracting(e -> ((ApiException) e).getStatus().value())
                .isEqualTo(503);
    }

    @Test
    void authorize_onlineWithGateway_chargesAndReturnsReference() {
        PaymentGateway gateway = mock(PaymentGateway.class);
        // O serviço normaliza "+258 84 123 4567" → "258841234567".
        when(gateway.charge("mpesa", "258841234567", null)).thenReturn("MP-TESTE12345");
        PaymentService withGateway = new PaymentService(provider(gateway));

        PaymentService.PaymentMethodInfo mpesa = withGateway.resolve("M-Pesa").orElseThrow();
        OrderRequest.PaymentInfoRequest info = new OrderRequest.PaymentInfoRequest("+258 84 123 4567", null);

        assertThat(withGateway.authorize(mpesa, info)).isEqualTo("MP-TESTE12345");
    }

    @Test
    void authorize_mpesaWithoutPhone_throws400() {
        PaymentGateway gateway = mock(PaymentGateway.class);
        PaymentService withGateway = new PaymentService(provider(gateway));
        PaymentService.PaymentMethodInfo mpesa = withGateway.resolve("mpesa").orElseThrow();

        assertThatThrownBy(() -> withGateway.authorize(mpesa, null))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("telemóvel");
        verify(gateway, never()).charge(anyString(), anyString(), anyString());
    }
}
