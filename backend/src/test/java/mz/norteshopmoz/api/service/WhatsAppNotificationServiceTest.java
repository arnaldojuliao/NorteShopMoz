package mz.norteshopmoz.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import mz.norteshopmoz.api.config.AppProperties;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.OrderAddress;
import mz.norteshopmoz.api.domain.OrderItem;
import mz.norteshopmoz.api.domain.OrderStatus;
import mz.norteshopmoz.api.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Aviso WhatsApp ao admin — pedido em «Aguarda pagamento» que ficou sem link.
 *
 * <p>Um {@link HttpServer} do próprio JDK faz de provedor: guarda o POST
 * {@code {to, message}} e os cabeçalhos, para o teste verificar o destinatário
 * (o número do ADMIN, não o cliente), o conteúdo e o Bearer. Sem WireMock: é
 * uma dependência nova para um contrato de duas chaves.</p>
 */
class WhatsAppNotificationServiceTest {

    private static final String ADMIN_PHONE = "+258 84 123 4567";

    private HttpServer server;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** Último pedido recebido pelo provedor falso. */
    private JsonNode lastBody;
    private String lastAuthorization;
    private CountDownLatch received;

    @BeforeEach
    void startFakeProvider() throws IOException {
        received = new CountDownLatch(1);
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/send", exchange -> {
            byte[] raw = exchange.getRequestBody().readAllBytes();
            try {
                lastBody = objectMapper.readTree(raw);
                lastAuthorization = exchange.getRequestHeaders().getFirst("Authorization");
            } catch (Exception e) {
                // Corpo inválido: o teste falha na asserção do destinatário.
            }
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
            received.countDown();
        });
        server.start();
    }

    @AfterEach
    void stopFakeProvider() {
        if (server != null) {
            server.stop(0);
        }
    }

    private String apiUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/send";
    }

    private WhatsAppNotificationService service(String adminPhone) {
        AppProperties props = new AppProperties(
                null, null,
                new AppProperties.Mail(null, "loja@norteshopmoz.com", "https://loja.mz"),
                null, null, null, null,
                new AppProperties.Whatsapp(apiUrl(), "segredo-do-provedor", adminPhone));
        return new WhatsAppNotificationService(mock(UserRepository.class), props);
    }

    private Order orderWithoutLink() {
        return Order.builder()
                .id("NSM-ADMIN-1")
                .date(Instant.now())
                .items(new ArrayList<>(List.of(
                        OrderItem.builder()
                                .productId("p-1").slug("camisola").name("Camisola")
                                .image("img.jpg").price(new BigDecimal("900")).qty(2).build(),
                        OrderItem.builder()
                                .productId("p-2").slug("bone").name("Boné")
                                .image("img.jpg").price(new BigDecimal("100")).qty(1).build())))
                .subtotal(new BigDecimal("1900"))
                .shipping(BigDecimal.ZERO)
                .discount(BigDecimal.ZERO)
                .total(new BigDecimal("1900"))
                .status(OrderStatus.AGUARDA_PAGAMENTO)
                .address(OrderAddress.builder()
                        .fullName("Cliente Link").phone("841234567")
                        .email("cliente@example.com").address("Rua 1")
                        .city("Maputo").province("Maputo").build())
                .paymentMethod("M-Pesa")
                .build();
    }

    @Test
    void avisaONumeroDoAdminComOPedidoEOLinkDoPainel() throws Exception {
        service(ADMIN_PHONE).sendPaymentLinkRequestToAdmin(orderWithoutLink());

        assertThat(received.await(5, TimeUnit.SECONDS))
                .as("o provedor falso recebeu o POST")
                .isTrue();

        // Só dígitos: é o formato que o provedor espera.
        assertThat(lastBody.path("to").asText()).isEqualTo("258841234567");
        String message = lastBody.path("message").asText();
        assertThat(message)
                .contains("NSM-ADMIN-1")
                .contains("Camisola")
                .contains("1900")
                .contains("841234567")
                .contains("https://loja.mz/admin");
        assertThat(lastAuthorization).isEqualTo("Bearer segredo-do-provedor");
    }

    @Test
    void semNumeroDoAdminNaoEnviaNada() throws Exception {
        // Canal ligado, mas nenhum destinatário configurado: não se inventa um.
        service("").sendPaymentLinkRequestToAdmin(orderWithoutLink());

        assertThat(received.await(1, TimeUnit.SECONDS))
                .as("nada foi enviado sem WHATSAPP_ADMIN_PHONE")
                .isFalse();
        assertThat(lastBody).isNull();
    }

    @Test
    void naoAvisaPedidoInexistente() throws Exception {
        service(ADMIN_PHONE).sendPaymentLinkRequestToAdmin(null);

        assertThat(received.await(1, TimeUnit.SECONDS)).isFalse();
    }

    /** Resumo de itens é limitado: o telemóvel do admin não é um recibo. */
    @Test
    void resumoDeItensNaoPassaDeTres() throws Exception {
        Order order = orderWithoutLink();
        List<OrderItem> items = new ArrayList<>(order.getItems());
        Map<String, OrderItem> extra = new LinkedHashMap<>();
        for (int i = 0; i < 3; i++) {
            extra.put("p-x" + i, OrderItem.builder()
                    .productId("p-x" + i).slug("extra-" + i).name("Extra " + i)
                    .image("img.jpg").price(new BigDecimal("10")).qty(1).build());
        }
        items.addAll(extra.values());
        order.setItems(items);

        service(ADMIN_PHONE).sendPaymentLinkRequestToAdmin(order);

        assertThat(received.await(5, TimeUnit.SECONDS)).isTrue();
        String message = lastBody.path("message").asText();
        assertThat(message).contains("Camisola").contains("Boné");
        assertThat(message).contains("…");
    }
}
