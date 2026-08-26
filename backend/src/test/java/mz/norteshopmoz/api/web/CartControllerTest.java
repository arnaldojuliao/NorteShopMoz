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
}