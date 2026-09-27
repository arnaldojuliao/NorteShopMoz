package mz.norteshopmoz.api.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import mz.norteshopmoz.api.domain.Product;
import mz.norteshopmoz.api.repository.OrderRepository;
import mz.norteshopmoz.api.repository.ProductRepository;
import mz.norteshopmoz.api.service.CouponService;
import mz.norteshopmoz.api.web.dto.CouponRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Checkout ponta a ponta ({@code POST /api/orders}, convidado).
 *
 * <p>Cobre a ordem das operações do checkout depois de a cobrança passar a
 * correr <strong>fora</strong> da transação de escrita: validar → cobrar →
 * transação curta (stock + cupão + pedido). Os testes unitários
 * ({@code OrderServicePaymentFlowTest}) fixam a ordem das chamadas; aqui
 * verifica-se o efeito real: stock, estado do pedido, referência da cobrança,
 * idempotência e que uma falha depois da cobrança não deixa pedido nem stock
 * negativo.</p>
 */
@SpringBootTest
@ActiveProfiles("unit-test")
@AutoConfigureMockMvc
class OrderCheckoutFlowTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ProductRepository productRepository;

    @Autowired
    OrderRepository orderRepository;

    @Autowired
    CouponService couponService;

    private static final BigDecimal PRICE = new BigDecimal("1000");

    /** Produto novo (id/slug únicos) com o stock pedido. */
    private Product product(int stock) {
        String uid = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        return productRepository.save(Product.builder()
                .id("chk-" + uid)
                .slug("chk-" + uid)
                .name("Produto Checkout " + uid)
                .category("eletronicos")
                .price(PRICE)
                .stock(stock)
                .sold(0)
                .shortDescription("teste")
                .images(List.of("img.jpg"))
                .description(List.of())
                .specs(List.of())
                .badges(List.of())
                .deliveryDays(List.of(3, 7))
                .tags(List.of())
                .build());
    }

    private String body(Product product, String paymentMethod, int qty, String couponCode) {
        String paymentInfo = "Pagamento na entrega".equals(paymentMethod)
                ? "{}"
                : "{\"phone\":\"+258840000000\"}";
        String coupon = couponCode == null ? "null" : "\"" + couponCode + "\"";
        return """
                {
                  "items": [{"productId":"%s","slug":"%s","name":"%s","image":"img.jpg","price":1000,"qty":%d}],
                  "subtotal": 1000,
                  "shipping": 120,
                  "discount": 0,
                  "total": 1120,
                  "paymentMethod": "%s",
                  "paymentInfo": %s,
                  "couponCode": %s,
                  "address": {"fullName":"Ana Teste","phone":"+258840000000","email":"ana-%s@example.com",
                              "address":"Rua 1","city":"Maputo","province":"Maputo Cidade"}
                }
                """.formatted(product.getId(), product.getSlug(), product.getName(), qty,
                paymentMethod, paymentInfo, coupon, UUID.randomUUID());
    }

    private MvcResult checkout(Product product, String paymentMethod, String idempotencyKey) throws Exception {
        return mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", idempotencyKey)
                        .header("X-Guest-Id", UUID.randomUUID().toString())
                        .content(body(product, paymentMethod, 1, null)))
                .andReturn();
    }

    private int stockOf(String productId) {
        return productRepository.findById(productId).orElseThrow().getStock();
    }

    @Test
    void checkoutOnlineConfirmaOPagamentoEDecrementaOStock() throws Exception {
        Product product = product(10);

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "online-" + UUID.randomUUID())
                        .content(body(product, "m-pesa", 2, null)))
                .andExpect(status().isCreated())
                // Pagamento online confirmado no checkout (gateway simulado no
                // perfil de testes) e com referência da cobrança.
                .andExpect(jsonPath("$.data.status").value("Pagamento confirmado"))
                .andExpect(jsonPath("$.data.paymentReference").value(startsWith("MP-")))
                .andExpect(jsonPath("$.data.paymentMethod").value("M-Pesa"));

        assertThat(stockOf(product.getId())).isEqualTo(8);
        assertThat(productRepository.findById(product.getId()).orElseThrow().getSold()).isEqualTo(2);
    }

    @Test
    void checkoutNaEntregaFicaPedidoRecebido() throws Exception {
        Product product = product(5);

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "cod-" + UUID.randomUUID())
                        .content(body(product, "Pagamento na entrega", 1, null)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("Pedido recebido"))
                // Sem cobrança online não há referência para estornar nem para
                // mostrar (o campo é omitido quando é null).
                .andExpect(jsonPath("$.data.paymentReference").doesNotExist());

        assertThat(stockOf(product.getId())).isEqualTo(4);
    }

    @Test
    void mesmaIdempotencyKeyNaoCobraNemDecrementaDuasVezes() throws Exception {
        Product product = product(3);
        String key = "idem-" + UUID.randomUUID();

        MvcResult first = checkout(product, "m-pesa", key);
        MvcResult second = checkout(product, "m-pesa", key);

        assertThat(first.getResponse().getStatus()).isEqualTo(201);
        assertThat(second.getResponse().getStatus()).isEqualTo(201);
        // O mesmo pedido (mesmo id) — o segundo pedido não voltou a reservar
        // stock nem a cobrar no gateway (só existe um pedido na base).
        String firstId = JsonPath.read(first.getResponse().getContentAsString(), "$.data.id");
        String secondId = JsonPath.read(second.getResponse().getContentAsString(), "$.data.id");
        assertThat(secondId).isEqualTo(firstId);
        assertThat(stockOf(product.getId())).isEqualTo(2);
    }

    @Test
    void produtoEsgotadoFalhaSemCriarPedidoNemStockNegativo() throws Exception {
        Product product = product(1);

        assertThat(checkout(product, "m-pesa", "esgota-1-" + UUID.randomUUID()).getResponse().getStatus())
                .isEqualTo(201);
        assertThat(stockOf(product.getId())).isZero();

        long ordersBefore = orderRepository.count();

        // Esgotado: a validação rejeita ANTES de cobrar (400), não se cria
        // pedido nenhum e o stock nunca fica negativo.
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "esgota-2-" + UUID.randomUUID())
                        .content(body(product, "m-pesa", 1, null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("esgotado")));

        assertThat(orderRepository.count()).isEqualTo(ordersBefore);
        assertThat(stockOf(product.getId())).isZero();
    }

    @Test
    void checkoutComCupaoAplicaDescontoEIncrementaOsUsos() throws Exception {
        Product product = product(5);
        String code = "CHK" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        couponService.create(new CouponRequest(code, new BigDecimal("10"), "PERCENT", null, null, true, 0));

        MvcResult result = mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "cupao-" + UUID.randomUUID())
                        .content(body(product, "m-pesa", 1, code)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.couponCode").value(code))
                .andReturn();

        // 10% sobre o subtotal de 1000 MT: o total tem de refletir o desconto
        // recalculado no servidor (o payload do cliente é só informativo).
        double total = JsonPath.read(result.getResponse().getContentAsString(), "$.data.total");
        assertThat(total).isEqualTo(120 + 900.0);

        assertThat(couponService.list().stream()
                .filter(c -> c.getCode().equals(code))
                .findFirst()
                .orElseThrow()
                .getUsedCount())
                .isEqualTo(1);
    }

    @Test
    void cupaoNoLimiteDeUsosFalhaSemCriarPedido() throws Exception {
        Product product = product(5);
        String code = "LIM" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        // Limite de 1 uso.
        couponService.create(new CouponRequest(code, new BigDecimal("10"), "PERCENT", null, null, true, 1));

        assertThat(mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "lim-1-" + UUID.randomUUID())
                        .content(body(product, "m-pesa", 1, code)))
                .andReturn().getResponse().getStatus())
                .isEqualTo(201);
        int stockAfterFirst = stockOf(product.getId());
        long ordersAfterFirst = orderRepository.count();

        // O cupão já atingiu o limite: o pedido falha com 400 ANTES de gravar (e
        // sem reservar stock) — um cupão esgotado não pode levar a um pedido
        // criado a menos, nem deixar o stock preso.
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "lim-2-" + UUID.randomUUID())
                        .content(body(product, "m-pesa", 1, code)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("limite de utilizações")));

        assertThat(orderRepository.count()).isEqualTo(ordersAfterFirst);
        assertThat(stockOf(product.getId())).isEqualTo(stockAfterFirst);
    }

    @Test
    void provinciaInvalidaFalhaSemCobrarNemReservarStock() throws Exception {
        Product product = product(5);
        String payload = body(product, "m-pesa", 1, null).replace("Maputo Cidade", "Provincia Inventada");

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "prov-" + UUID.randomUUID())
                        .content(payload))
                .andExpect(status().isBadRequest());

        // Validação antes da cobrança: nada foi reservado.
        assertThat(stockOf(product.getId())).isEqualTo(5);
    }
}
