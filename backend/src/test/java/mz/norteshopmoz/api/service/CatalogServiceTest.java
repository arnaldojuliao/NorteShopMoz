package mz.norteshopmoz.api.service;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Transactional;

import mz.norteshopmoz.api.domain.Category;
import mz.norteshopmoz.api.domain.Product;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.CategoryRepository;
import mz.norteshopmoz.api.repository.ProductRepository;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.web.dto.ProductRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("unit-test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class CatalogServiceTest {

    @Autowired
    CatalogService catalogService;

    @Autowired
    ProductRepository productRepository;

    @Autowired
    CategoryRepository categoryRepository;

    private UserPrincipal adminPrincipal() {
        return new UserPrincipal("admin-id", "admin@test.com", "Admin", "ADMIN");
    }

    private UserPrincipal customerPrincipal() {
        return new UserPrincipal("cust-id", "cust@test.com", "Customer", "CUSTOMER");
    }

    @Test
    void createProduct_admin_createsProduct() {
        Category cat = categoryRepository.save(Category.builder()
                .slug("test-cat")
                .name("Test Category")
                .emoji("🧪")
                .image("img.jpg")
                .description("Test desc")
                .build());

        ProductRequest request = new ProductRequest(
                "Test Product",
                "Test Brand",
                cat.getSlug(),
                new BigDecimal("1000"),
                new BigDecimal("1200"),
                10,
                "Short description",
                List.of("Desc line 1"),
                List.of("img1.jpg"),
                List.of("tag1"),
                List.of("badge1"),
                List.of(new ProductRequest.SpecRequest("Color", "Red")),
                List.of(new ProductRequest.VariantRequest("Size", List.of(new ProductRequest.OptionRequest("M", "#ff0000")))),
                List.of(1, 3),
                true,
                true,
                true,
                false,
                true
        );

        Product product = catalogService.createProduct(request);

        assertThat(product.getId()).isNotBlank();
        assertThat(product.getName()).isEqualTo("Test Product");
        assertThat(product.getSlug()).contains("test-product");
        assertThat(product.getCategory()).isEqualTo(cat.getSlug());
        assertThat(product.getPrice()).isEqualByComparingTo("1000");
    }

    @Test
    void updateProduct_changesFields_andRegeneratesSlugOnRename() {
        Category cat = categoryRepository.save(Category.builder()
                .slug("test-cat-3")
                .name("Test Category 3")
                .emoji("🧪")
                .image("img.jpg")
                .description("Test desc")
                .build());

        Product created = catalogService.createProduct(request(cat.getSlug(), "Original Name"));

        ProductRequest rename = request(cat.getSlug(), "Renamed Product");
        Product updated = catalogService.updateProduct(created.getId(), rename);

        assertThat(updated.getId()).isEqualTo(created.getId());
        assertThat(updated.getName()).isEqualTo("Renamed Product");
        assertThat(updated.getSlug()).contains("renamed-product");
        assertThat(updated.getPrice()).isEqualByComparingTo("999.99");
        assertThat(updated.getStock()).isEqualTo(7);
    }

    @Test
    void updateProduct_keepsSlug_whenNameUnchanged() {
        Category cat = categoryRepository.save(Category.builder()
                .slug("test-cat-4")
                .name("Test Category 4")
                .emoji("🧪")
                .image("img.jpg")
                .description("Test desc")
                .build());

        Product created = catalogService.createProduct(request(cat.getSlug(), "Stable Name"));
        String originalSlug = created.getSlug();

        // Muda só o preço — o slug (URL partilhável) mantém-se estável.
        Product updated = catalogService.updateProduct(created.getId(),
                request(cat.getSlug(), "Stable Name"));

        assertThat(updated.getSlug()).isEqualTo(originalSlug);
    }

    @Test
    void updateProduct_unknownId_throws404() {
        Category cat = categoryRepository.save(Category.builder()
                .slug("test-cat-5")
                .name("Test Category 5")
                .emoji("🧪")
                .image("img.jpg")
                .description("Test desc")
                .build());
        ProductRequest req = request(cat.getSlug(), "Any");

        assertThatThrownBy(() -> catalogService.updateProduct("p-inexistente", req))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("não encontrado");
    }

    @Test
    void updateProduct_invalidCategory_throws400() {
        Category cat = categoryRepository.save(Category.builder()
                .slug("test-cat-6")
                .name("Test Category 6")
                .emoji("🧪")
                .image("img.jpg")
                .description("Test desc")
                .build());

        Product created = catalogService.createProduct(request(cat.getSlug(), "Valid Product"));

        assertThatThrownBy(() ->
                catalogService.updateProduct(created.getId(), request("categoria-fantasma", "Valid Product")))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Categoria inválida");
    }

    @Test
    void deleteProduct_removesAndSubsequentGetThrows404() {
        Category cat = categoryRepository.save(Category.builder()
                .slug("test-cat-7")
                .name("Test Category 7")
                .emoji("🧪")
                .image("img.jpg")
                .description("Test desc")
                .build());

        Product created = catalogService.createProduct(request(cat.getSlug(), "Doomed Product"));
        catalogService.deleteProduct(created.getId());

        assertThat(productRepository.existsById(created.getId())).isFalse();
        assertThatThrownBy(() -> catalogService.deleteProduct(created.getId()))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("não encontrado");
    }

    private ProductRequest request(String category, String name) {
        return new ProductRequest(
                name,
                "Brand",
                category,
                new BigDecimal("999.99"),
                null,
                7,
                "Short description",
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(2, 5),
                false,
                false,
                true,
                false,
                false
        );
    }

    @Test
    void getProducts_returnsProducts() {
        Category cat = categoryRepository.save(Category.builder()
                .slug("test-cat-2")
                .name("Test Category 2")
                .emoji("🧪")
                .image("img.jpg")
                .description("Test desc")
                .build());

        for (int i = 0; i < 3; i++) {
            productRepository.save(Product.builder()
                    .id("p-list-" + i)
                    .slug("prod-" + i)
                    .name("Product " + i)
                    .brand("Brand")
                    .category(cat.getSlug())
                    .price(new BigDecimal(100 + i * 10))
                    .stock(10)
                    .images(List.of())
                    .shortDescription("")
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
        }

        var products = catalogService.getProducts(new mz.norteshopmoz.api.service.ProductQuery(
                null, null, null, false, false, false, false, null, null, 10
        ));

        // There may be existing products from seeder, so check at least our 3 are there
        assertThat(products).hasSizeGreaterThanOrEqualTo(3);
    }
}