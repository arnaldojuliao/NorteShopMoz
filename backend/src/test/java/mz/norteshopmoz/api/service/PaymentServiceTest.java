package mz.norteshopmoz.api.service;

import java.math.BigDecimal;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.web.dto.OrderRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Testes unitários do {@link PaymentService} — resolução de métodos, validação
 * dos dados de pagamento e o comportamento do checkout hospedado.
 *
 * <p>O caso que interessa a partir da integração com a PaySuite: quando o gateway
 * usa página de pagamento própria, o telefone/cartão são recolhidos lá e a loja
 * <strong>não</strong> os pode exigir — mas a validação continua a existir para
 * gateways que cobram diretamente.</p>
 */
class PaymentServiceTest {

    /** Fila de reconciliação mockada — o serviço grava nela os estornos falhados. */
    private final PaymentIncidentService incidentService = mock(PaymentIncidentService.class);

    @SuppressWarnings("unchecked")
    private static ObjectProvider<PaymentGateway> provider(PaymentGateway gateway) {
        ObjectProvider<PaymentGateway> mock = mock(ObjectProvider.class);
        when(mock.getIfAvailable()).thenReturn(gateway);
        return mock;
    }

    private final PaymentService service = new PaymentService(provider(null), incidentService, 8, 10);

    @Test
    void resolve_acceptsLabelAndAliases_caseInsensitive() {
        assertThat(service.resolve("M-Pesa")).map(PaymentService.PaymentMethodInfo::id).contains("mpesa");
        assertThat(service.resolve("MPESA")).map(PaymentService.PaymentMethodInfo::id).contains("mpesa");
        assertThat(service.resolve("emola")).map(PaymentService.PaymentMethodInfo::id).contains("emola");
        assertThat(service.resolve("metodo-inexistente")).isEmpty();
        assertThat(service.resolve(null)).isEmpty();
    }

    @Test
    void resolve_rejeitaMetodosOfflineRemovidos() {
        assertThat(service.resolve("Pagamento na entrega")).isEmpty();
        assertThat(service.resolve("Transferência bancária")).isEmpty();
        assertThat(service.resolve("Cash on delivery")).isEmpty();
        assertThat(service.resolve("Bank transfer")).isEmpty();
        assertThat(service.resolve("cod")).isEmpty();
        assertThat(service.resolve("transfer")).isEmpty();
    }

    @Test
    void currentlyAvailableLabels_semGateway_naoOfereceNenhumMetodo() {
        assertThat(service.currentlyAvailableLabels()).isEmpty();
    }

    @Test
    void currentlyAvailableLabels_comGateway_ofereceTodosOsMetodosOnline() {
        PaymentGateway gateway = mock(PaymentGateway.class);
        PaymentService withGateway = new PaymentService(provider(gateway), incidentService, 8, 10);

        assertThat(withGateway.currentlyAvailableLabels())
                .containsExactly("M-Pesa", "e-Mola", "mKesh", "Cartão Visa / Mastercard");
    }

    @Test
    void authorize_onlineWithoutGateway_throws503() {
        PaymentService.PaymentMethodInfo mpesa = service.resolve("mpesa").orElseThrow();
        OrderRequest.PaymentInfoRequest info = new OrderRequest.PaymentInfoRequest("841234567", null);

        assertThatThrownBy(() -> service.authorize(mpesa, "NSM-1", info, BigDecimal.TEN))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("indispon")
                .extracting(e -> ((ApiException) e).getStatus().value())
                .isEqualTo(503);
    }

    @Test
    void authorize_onlineWithGateway_chargesAndReturnsReference() {
        PaymentGateway gateway = mock(PaymentGateway.class);
        // O serviço normaliza "+258 84 123 4567" → "258841234567".
        when(gateway.charge(eq("NSM-TESTE"), eq("mpesa"), eq("258841234567"), isNull(),
                eq(BigDecimal.TEN), eq("MZN"), anyString()))
                .thenReturn(PaymentGateway.PaymentCharge.confirmed("MP-TESTE12345"));
        PaymentService withGateway = new PaymentService(provider(gateway), incidentService, 8, 10);

        PaymentService.PaymentMethodInfo mpesa = withGateway.resolve("M-Pesa").orElseThrow();
        OrderRequest.PaymentInfoRequest info = new OrderRequest.PaymentInfoRequest("+258 84 123 4567", null);

        assertThat(withGateway.authorize(mpesa, "NSM-TESTE", info, BigDecimal.TEN).reference())
                .isEqualTo("MP-TESTE12345");
    }

    @Test
    void authorize_mpesaWithoutPhone_throws400() {
        PaymentGateway gateway = mock(PaymentGateway.class);
        PaymentService withGateway = new PaymentService(provider(gateway), incidentService, 8, 10);
        PaymentService.PaymentMethodInfo mpesa = withGateway.resolve("mpesa").orElseThrow();

        assertThatThrownBy(() -> withGateway.authorize(mpesa, "NSM-1", null, BigDecimal.TEN))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("telemóvel");
        verify(gateway, never()).charge(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void authorize_checkoutHospedado_naoExigeTelefoneNemCartao() {
        // PaySuite: quem recolhe o número é a página de pagamento do provedor. Se a
        // loja continuasse a exigi-lo, o cliente preenchia um campo inútil e o
        // checkout aparentava cobrar ali.
        PaymentGateway gateway = mock(PaymentGateway.class);
        when(gateway.hostedCheckout()).thenReturn(true);
        when(gateway.charge(eq("NSM-7"), eq("mpesa"), isNull(), isNull(), eq(BigDecimal.TEN),
                eq("MZN"), anyString()))
                .thenReturn(PaymentGateway.PaymentCharge.redirect("01H8X9", "https://paysuite.tech/checkout/01H8X9"));
        PaymentService withGateway = new PaymentService(provider(gateway), incidentService, 8, 10);
        PaymentService.PaymentMethodInfo mpesa = withGateway.resolve("mpesa").orElseThrow();

        PaymentGateway.PaymentCharge charge = withGateway.authorize(mpesa, "NSM-7", null, BigDecimal.TEN);

        assertThat(charge.redirectRequired()).isTrue();
        assertThat(charge.checkoutUrl()).isEqualTo("https://paysuite.tech/checkout/01H8X9");
        assertThat(charge.reference()).isEqualTo("01H8X9");
    }

    @Test
    void hostedCheckout_refleteOGatewayAtivo() {
        assertThat(service.hostedCheckout()).isFalse();

        PaymentGateway hosted = mock(PaymentGateway.class);
        when(hosted.hostedCheckout()).thenReturn(true);
        assertThat(new PaymentService(provider(hosted), incidentService, 8, 10).hostedCheckout()).isTrue();
    }

    @Test
    void refund_semValorNaoChamaOGateway() {
        PaymentGateway gateway = mock(PaymentGateway.class);
        PaymentService withGateway = new PaymentService(provider(gateway), incidentService, 8, 10);

        // Um estorno de valor desconhecido não é um estorno: o provedor exige o
        // montante, portanto sem ele nada é enviado (e nada é dado como estornado).
        withGateway.refund("PS-1", null);
        withGateway.refund("PS-1", BigDecimal.ZERO);
        withGateway.refund(null, BigDecimal.TEN);

        verify(gateway, never()).refund(any(), any());
    }

    @Test
    void refund_comValorEstornaNoGateway() {
        PaymentGateway gateway = mock(PaymentGateway.class);
        PaymentService withGateway = new PaymentService(provider(gateway), incidentService, 8, 10);

        withGateway.refund("PS-1", new BigDecimal("15900.00"));

        verify(gateway).refund("PS-1", new BigDecimal("15900.00"));
    }
}
