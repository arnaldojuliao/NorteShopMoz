package mz.norteshopmoz.api.bootstrap;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import mz.norteshopmoz.api.domain.Category;
import mz.norteshopmoz.api.domain.Product;
import mz.norteshopmoz.api.domain.ProductSpec;
import mz.norteshopmoz.api.domain.ProductVariant;
import mz.norteshopmoz.api.domain.Review;
import mz.norteshopmoz.api.domain.UserAccount;
import mz.norteshopmoz.api.repository.CategoryRepository;
import mz.norteshopmoz.api.repository.ProductRepository;
import mz.norteshopmoz.api.repository.ReviewRepository;
import mz.norteshopmoz.api.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/**
 * Semeador do catálogo — lê {@code seed/catalog.json} (gerado a partir do
 * catálogo TypeScript do frontend, fonte única de verdade) e guarda na base
 * de dados, apenas quando a tabela de produtos está vazia.
 * <p>
 * A desserialização passa por records DTO porque vários campos são opcionais
 * no JSON (featured, isNew, variants, oldPrice, …) — mapeamento explícito.
 */
@Component
public class DataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    /** Credenciais do administrador (alterar em produção via seed/env). */
    static final String ADMIN_EMAIL = "admin@norteshopmoz.com";
    static final String ADMIN_PASSWORD = "Admin@2026";

    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final ReviewRepository reviewRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;

    public DataSeeder(
            CategoryRepository categoryRepository,
            ProductRepository productRepository,
            ReviewRepository reviewRepository,
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            ObjectMapper objectMapper) {
        this.categoryRepository = categoryRepository;
        this.productRepository = productRepository;
        this.reviewRepository = reviewRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.objectMapper = objectMapper;
    }

    /** Recordes de leitura do seed — campos opcionais em boxed types. */
    record SeedCatalog(List<Category> categories, List<SeedProduct> products) {}

    record SeedProduct(
            String id,
            String slug,
            String name,
            String brand,
            String category,
            BigDecimal price,
            BigDecimal oldPrice,
            Double rating,
            Integer ratingCount,
            Integer sold,
            Integer stock,
            List<String> images,
            String shortDescription,
            List<String> description,
            List<ProductSpec> specs,
            List<String> badges,
            Boolean featured,
            Boolean bestseller,
            Boolean isNew,
            Boolean dealOfDay,
            List<ProductVariant> variants,
            List<Integer> deliveryDays,
            Boolean freeShipping,
            List<String> tags) {}

    @Override
    @Transactional
    public void run(String... args) throws Exception {
        ensureAdminUser();

        if (productRepository.count() > 0) {
            log.info("Catálogo já existe — a semear não é necessário.");
            return;
        }

        log.info("Base de dados vazia — a semear catálogo…");
        SeedCatalog seed = objectMapper.readValue(
                new ClassPathResource("seed/catalog.json").getInputStream(), SeedCatalog.class);

        categoryRepository.saveAll(seed.categories());
        productRepository.saveAll(seed.products().stream().map(this::toProduct).toList());
        seedReviews(productRepository.findAll());

        log.info("Catálogo semeado: {} categorias, {} produtos, {} avaliações",
                seed.categories().size(), productRepository.count(), reviewRepository.count());
    }

    /** Garante a existência do utilizador administrador (idempotente). */
    private void ensureAdminUser() {
        if (userRepository.existsByEmailIgnoreCase(ADMIN_EMAIL)) {
            return;
        }
        userRepository.save(UserAccount.builder()
                .email(ADMIN_EMAIL)
                .fullName("Administrador NorteShop")
                .phone("+258 84 000 0001")
                .passwordHash(passwordEncoder.encode(ADMIN_PASSWORD))
                .createdAt(Instant.now())
                .role("ADMIN")
                .build());
        log.info("Utilizador administrador criado: {}", ADMIN_EMAIL);
    }

    private Product toProduct(SeedProduct s) {
        return Product.builder()
                .id(s.id())
                .slug(s.slug())
                .name(s.name())
                .brand(s.brand())
                .category(s.category())
                .price(s.price() == null ? BigDecimal.ZERO : s.price())
                .oldPrice(s.oldPrice())
                .rating(s.rating() == null ? 0 : s.rating())
                .ratingCount(s.ratingCount() == null ? 0 : s.ratingCount())
                .sold(s.sold() == null ? 0 : s.sold())
                .stock(s.stock() == null ? 0 : s.stock())
                .images(nonNullList(s.images()))
                .shortDescription(s.shortDescription() == null ? "" : s.shortDescription())
                .description(nonNullList(s.description()))
                .specs(nonNullList(s.specs()))
                .badges(nonNullList(s.badges()))
                .featured(Boolean.TRUE.equals(s.featured()))
                .bestseller(Boolean.TRUE.equals(s.bestseller()))
                .isNew(Boolean.TRUE.equals(s.isNew()))
                .dealOfDay(Boolean.TRUE.equals(s.dealOfDay()))
                .variants(s.variants())
                .deliveryDays(s.deliveryDays() == null ? List.of(3, 7) : s.deliveryDays())
                .freeShipping(Boolean.TRUE.equals(s.freeShipping()))
                .tags(nonNullList(s.tags()))
                .build();
    }

    private <T> List<T> nonNullList(List<T> list) {
        return list == null ? List.of() : list;
    }

    private void seedReviews(List<Product> products) {
        String[] authors = {"Carlos M.", "Anabela T.", "José N.", "Marta C."};
        String[] comments = {
                "Excelente qualidade pelo preço. Entrega rápida em Maputo.",
                "Muito satisfeito com a compra. Recomendo a NorteShop.",
                "Produto conforme a descrição. Voltarei a comprar.",
                "Boa experiência de compra, chegou dentro do prazo."
        };
        int i = 0;
        for (Product product : products) {
            for (int r = 0; r < 2 && i < 200; r++) {
                int idx = (i + r) % authors.length;
                reviewRepository.save(Review.builder()
                        .product(product)
                        .author(authors[(idx + r) % authors.length])
                        .rating(4 + (r % 2))
                        .date(Instant.now().minusSeconds(86400L * (r + 1) * (i % 9 + 1)))
                        .title(r == 0 ? "Excelente qualidade!" : "Recomendo")
                        .comment(comments[(idx + r) % comments.length])
                        .verified(true)
                        .build());
                i++;
            }
        }
    }
}
