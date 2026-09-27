package mz.norteshopmoz.api.web;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Transactional;

import mz.norteshopmoz.api.domain.CartItem;
import mz.norteshopmoz.api.domain.Product;
import mz.norteshopmoz.api.repository.CartRepository;
import mz.norteshopmoz.api.repository.ProductRepository;
import mz.norteshopmoz.api.web.dto.CartItemRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@ActiveProfiles("unit-test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@AutoConfigureMockMvc
class CartControllerTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    CartRepository cartRepository;

    @Autowired
    ProductRepository productRepository;

    @Test
    void getCart_guest_returnsEmpty() throws Exception {
        mockMvc.perform(get("/api/cart")
                        .header("X-Guest-Id", "guest-123"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data").isEmpty());
    }

    @Test
    void putCart_guest_savesItems() throws Exception {
        Product product = productRepository.save(Product.builder()
                .id("p-cart-1")
                .slug("cart-product")
                .name("Cart Product")
                .brand("Brand")
                .category("cat")
                .price(new BigDecimal("500"))
                .stock(10)
                .images(List.of("img.jpg"))
                .shortDescription("Short")
                .description(List.of())
                .specs(List.of())
                .badges(List.of())
                .featured(false)
                .bestseller(false)
                .isNew(false)
                .dealOfDay(false)
                .variants(List.of())
                .deliveryDays(List.of(1, 3))
                .freeShipping(false)
                .tags(List.of())
                .build());

        String payload = """
                [{"productId": "%s", "qty": 2, "variant": null}]
                """.formatted(product.getId());

        mockMvc.perform(put("/api/cart")
                        .header("X-Guest-Id", "guest-456")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data[0].productId").value(product.getId()))
                .andExpect(jsonPath("$.data[0].qty").value(2));
    }

    @Test
    void putCart_invalidToken_returnsUnauthorized() throws Exception {
        String payload = """
                [{"productId": "p-1", "qty": 1, "variant": null}]
                """;

        mockMvc.perform(put("/api/cart")
                        .header("Authorization", "Bearer invalid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void putCart_guestIdComFormatoInvalido_returnsBadRequest() throws Exception {
        // Curto demais para ser um identificador de dispositivo e com caracteres
        // que não têm lugar numa chave — antes era aceite e criava uma linha.
        mockMvc.perform(put("/api/cart")
                        .header("X-Guest-Id", "abc")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[]"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void putCart_guestIdDemasiadoLongo_returnsBadRequest() throws Exception {
        // A coluna user_id tem 64 caracteres: um header maior rebentava com 500.
        // Passa a 400 explicito (nunca chega à base de dados).
        mockMvc.perform(put("/api/cart")
                        .header("X-Guest-Id", "g".repeat(80))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[]"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void putCart_guestIdValidoNaoEhAceiteComoCarrinhoDeConta() throws Exception {
        // O prefixo `guest:` impede que o ID de um visitante colida com o id de
        // um utilizador (UUID) e dê acesso ao carrinho de uma conta.
        mockMvc.perform(put("/api/cart")
                        .header("X-Guest-Id", "7f3c1b1e-2a4d-4c9e-9a11-5d6e7f8a9b0c")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[]"))
                .andExpect(status().isOk());

        assertThat(cartRepository.findById("guest:7f3c1b1e-2a4d-4c9e-9a11-5d6e7f8a9b0c"))
                .as("a chave gravada leva o prefixo guest:")
                .isPresent();
    }
}