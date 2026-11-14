package mz.norteshopmoz.api.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.OrderAddress;
import mz.norteshopmoz.api.domain.OrderItem;
import mz.norteshopmoz.api.domain.OrderStatus;
import mz.norteshopmoz.api.domain.UserAccount;
import mz.norteshopmoz.api.repository.OrderRepository;
import mz.norteshopmoz.api.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Endpoint do link de pagamento — POST /api/orders/admin/{id}/payment-link
 * (admin cola o link). O caminho do cliente (POST /api/orders/{id}/payment-link)
 * foi removido: o link é sempre o do provedor ou o que o admin cola.
 *
 * <p>Cobre o que os testes de serviço não veem: a autorização do matcher, a
 * validação do corpo, o CSRF (o path está sob {@code /api/orders/}, que exige
 * token) e a contagem que alimenta o badge do painel
 * ({@code paymentLinkPending} em GET /api/orders/admin/all).</p>
 */
@SpringBootTest
@ActiveProfiles("unit-test")
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class OrderPaymentLinkEndpointTest {

    /** Token CSRF do double-submit (cookie + header têm de coincidir). */
    private static final String CSRF = "csrf-" + UUID.randomUUID();

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JwtService jwtService;

    @Autowired
    OrderRepository orderRepository;

    /**
     * Token de acesso para um utilizador não persistido. O filtro JWT relê a
     * role da base de dados e, não encontrando o uid, mantém a claim — permite
     * testar cada role (e a posse do pedido) sem criar contas.
     */
    private String token(String role, String userId) {
        UserAccount user = UserAccount.builder()
                .id(userId)
                .email("link-" + UUID.randomUUID() + "@example.com")
                .fullName("Link")
                .passwordHash("hash")
                .role(role)
                .build();
        // Sem sid: não passa pelo idle timeout (não depende do Redis no teste).
        return jwtService.generateToken(user, null);
    }

    /** Pedido completo (itens + morada) — o mínimo para o JPA gravar. */
    private Order order(String id, OrderStatus status, String userId, String checkoutUrl) {
        return Order.builder()
                .id(id)
                .date(Instant.now())
                .userId(userId)
                .items(new ArrayList<>(List.of(OrderItem.builder()
                        .productId("p-link-1")
                        .slug("produto-link")
                        .name("Produto com link")
                        .image("img.jpg")
                        .price(new BigDecimal("1000"))
                        .qty(1)
                        .build())))
                .subtotal(new BigDecimal("1000"))
                .shipping(BigDecimal.ZERO)
                .discount(BigDecimal.ZERO)
                .total(new BigDecimal("1000"))
                .status(status)
                .address(OrderAddress.builder()
                        .fullName("Cliente Link")
                        .phone("841234567")
                        .email("cliente-link@example.com")
                        .address("Rua 1")
                        .city("Maputo")
                        .province("Maputo")
                        .build())
                .paymentMethod("M-Pesa")
                .checkoutUrl(checkoutUrl)
                .build();
    }

    /** Pedido novo com id único — evita colisões entre execuções do contexto. */
    private Order persist(OrderStatus status, String userId, String checkoutUrl) {
        return orderRepository.save(order("pl-" + UUID.randomUUID(), status, userId, checkoutUrl));
    }

    /** POST com o token CSRF que o filtro exige em /api/orders/**. */
    private MockHttpServletRequestBuilder postJson(String path, String body) {
        return post(path)
                .cookie(new Cookie("nsm_csrf", CSRF))
                .header("X-CSRF-Token", CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
    }

    private MockHttpServletRequestBuilder postJsonAs(String path, String body, String token) {
        return postJson(path, body).header("Authorization", "Bearer " + token);
    }

    /* ── Admin cola o link ─────────────────────────────────────────────────── */

    @Test
    void semTokenDevolve401() throws Exception {
        Order o = persist(OrderStatus.AGUARDA_PAGAMENTO, null, null);

        mockMvc.perform(postJson("/api/orders/admin/" + o.getId() + "/payment-link",
                        "{\"url\":\"https://paysuite.tech/checkout/abc\"}"))
                .andExpect(status().isUnauthorized());

        assertThat(orderRepository.findById(o.getId()).orElseThrow().getCheckoutUrl()).isNull();
    }

    @Test
    void clienteNaoPodeDefinirLink() throws Exception {
        Order o = persist(OrderStatus.AGUARDA_PAGAMENTO, null, null);

        mockMvc.perform(postJsonAs("/api/orders/admin/" + o.getId() + "/payment-link",
                        "{\"url\":\"https://paysuite.tech/checkout/abc\"}",
                        token("CUSTOMER", "cliente-" + UUID.randomUUID())))
                .andExpect(status().isForbidden());

        assertThat(orderRepository.findById(o.getId()).orElseThrow().getCheckoutUrl()).isNull();
    }

    @Test
    void adminDefineEGravaOLink() throws Exception {
        Order o = persist(OrderStatus.AGUARDA_PAGAMENTO, null, null);

        mockMvc.perform(postJsonAs("/api/orders/admin/" + o.getId() + "/payment-link",
                        "{\"url\":\"https://paysuite.tech/checkout/abc\"}",
                        token("ADMIN", "admin-" + UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(o.getId()))
                .andExpect(jsonPath("$.data.checkoutUrl").value("https://paysuite.tech/checkout/abc"));

        // Persistido (V12): o link sobrevive ao refresh e à página de acompanhamento.
        assertThat(orderRepository.findById(o.getId()).orElseThrow().getCheckoutUrl())
                .isEqualTo("https://paysuite.tech/checkout/abc");
    }

    @Test
    void linkInvalidoDevolve400() throws Exception {
        Order o = persist(OrderStatus.AGUARDA_PAGAMENTO, null, null);
        String admin = token("ADMIN", "admin-" + UUID.randomUUID());

        // Não é http(s) — o campo aceita só links clicáveis.
        mockMvc.perform(postJsonAs("/api/orders/admin/" + o.getId() + "/payment-link",
                        "{\"url\":\"javascript:alert(1)\"}", admin))
                .andExpect(status().isBadRequest());

        // URL vazio também é rejeitado pelo bean validation do corpo.
        mockMvc.perform(postJsonAs("/api/orders/admin/" + o.getId() + "/payment-link",
                        "{\"url\":\"\"}", admin))
                .andExpect(status().isBadRequest());

        assertThat(orderRepository.findById(o.getId()).orElseThrow().getCheckoutUrl()).isNull();
    }

    @Test
    void pedidoQueJaNaoAguardaPagamentoDevolve400() throws Exception {
        Order o = persist(OrderStatus.PAGAMENTO_CONFIRMADO, null, null);

        mockMvc.perform(postJsonAs("/api/orders/admin/" + o.getId() + "/payment-link",
                        "{\"url\":\"https://paysuite.tech/checkout/abc\"}",
                        token("ADMIN", "admin-" + UUID.randomUUID())))
                .andExpect(status().isBadRequest());

        assertThat(orderRepository.findById(o.getId()).orElseThrow().getCheckoutUrl()).isNull();
    }

    @Test
    void pedidoInexistenteDevolve404() throws Exception {
        mockMvc.perform(postJsonAs("/api/orders/admin/nao-existe/payment-link",
                        "{\"url\":\"https://paysuite.tech/checkout/abc\"}",
                        token("ADMIN", "admin-" + UUID.randomUUID())))
                .andExpect(status().isNotFound());
    }

    @Test
    void escritaSemTokenCsrfEhRecusada() throws Exception {
        Order o = persist(OrderStatus.AGUARDA_PAGAMENTO, null, null);

        // Bearer válido mas sem o double-submit: o filtro CSRF barra antes do controller.
        mockMvc.perform(post("/api/orders/admin/" + o.getId() + "/payment-link")
                        .header("Authorization", "Bearer " + token("ADMIN", "admin-" + UUID.randomUUID()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\":\"https://paysuite.tech/checkout/abc\"}"))
                .andExpect(status().isForbidden());

        assertThat(orderRepository.findById(o.getId()).orElseThrow().getCheckoutUrl()).isNull();
    }

    /* ── Só o admin define o link ────────────────────────────────────────────── */

    @Test
    void rotaDoClienteParaGerarLinkNaoExiste() throws Exception {
        // O cliente não pode gerar o seu próprio link: a rota foi removida (o
        // link é sempre o do provedor ou colado pelo admin).
        Order o = persist(OrderStatus.AGUARDA_PAGAMENTO, null, null);

        mockMvc.perform(postJsonAs("/api/orders/" + o.getId() + "/payment-link", "",
                        token("CUSTOMER", "cliente-" + UUID.randomUUID())))
                .andExpect(status().is4xxClientError());

        assertThat(orderRepository.findById(o.getId()).orElseThrow().getCheckoutUrl()).isNull();
    }

    @Test
    void clienteNaoDefineLinkPeloCaminhoDoAdmin() throws Exception {
        Order o = persist(OrderStatus.AGUARDA_PAGAMENTO, null, null);

        mockMvc.perform(postJsonAs("/api/orders/admin/" + o.getId() + "/payment-link",
                        "{\"url\":\"https://paysuite.tech/checkout/abc\"}",
                        token("CUSTOMER", "cliente-" + UUID.randomUUID())))
                .andExpect(status().isForbidden());
    }

    /* ── Badge do painel ──────────────────────────────────────────────────── */

    @Test
    void painelContaOsPedidosSemLink() throws Exception {
        String admin = token("ADMIN", "admin-" + UUID.randomUUID());

        long antes = pendingCount(admin);

        // Dois pedidos em «Aguarda pagamento» sem link e um com link: só os
        // primeiros contam para o badge (é o que o admin tem de resolver).
        persist(OrderStatus.AGUARDA_PAGAMENTO, null, null);
        persist(OrderStatus.AGUARDA_PAGAMENTO, null, "   ");
        persist(OrderStatus.AGUARDA_PAGAMENTO, null, "https://paysuite.tech/checkout/ok");

        assertThat(pendingCount(admin))
                .as("o badge conta pedidos a aguardar pagamento SEM link")
                .isEqualTo(antes + 2);
    }

    /** Lê {@code paymentLinkPending} da página de pedidos do painel. */
    private long pendingCount(String token) throws Exception {
        String body = mockMvc.perform(get("/api/orders/admin/all")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.<Number>read(body, "$.data.paymentLinkPending").longValue();
    }
}
