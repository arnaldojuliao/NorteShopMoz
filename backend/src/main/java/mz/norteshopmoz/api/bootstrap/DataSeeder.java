package mz.norteshopmoz.api.bootstrap;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import mz.norteshopmoz.api.domain.Category;
import mz.norteshopmoz.api.domain.Coupon;
import mz.norteshopmoz.api.domain.Product;
import mz.norteshopmoz.api.domain.ProductSpec;
import mz.norteshopmoz.api.domain.ProductVariant;
import mz.norteshopmoz.api.domain.Review;
import mz.norteshopmoz.api.domain.UserAccount;
import mz.norteshopmoz.api.repository.CategoryRepository;
import mz.norteshopmoz.api.repository.CouponRepository;
import mz.norteshopmoz.api.repository.ProductRepository;
import mz.norteshopmoz.api.repository.ReviewRepository;
import mz.norteshopmoz.api.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
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

    /** Credenciais do administrador por omissão (apenas dev/testes). */
    static final String DEFAULT_ADMIN_EMAIL = "admin@norteshopmoz.com";
    static final String DEFAULT_ADMIN_PASSWORD = "Admin@2026";

    /** Cupões de demonstração — criados apenas fora de produção. */
    static final String DEMO_COUPON_BEMVINDO = "BEMVINDO10";
    static final String DEMO_COUPON_ENTREGA = "ENTREGA500";

    /**
     * Credenciais efetivas do administrador criado no arranque.
     *
     * Vêm de {@code ADMIN_EMAIL}/{@code ADMIN_PASSWORD}; sem elas usam-se os
     * valores de desenvolvimento — que são públicos (estão no repositório). Com
     * o perfil {@code prod} e a password por omissão a aplicação <strong>não
     * arranca</strong> (mesma política do {@code JwtService} para JWT_SECRET),
     * senão uma base de dados nova ficava com um administrador de password
     * conhecida.
     */
    private final String adminEmail;
    private final String adminPassword;
    /** Perfil `prod` ativo — usado pelas guardas de credenciais do administrador. */
    private final boolean prodProfile;

    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final ReviewRepository reviewRepository;
    private final UserRepository userRepository;
    private final CouponRepository couponRepository;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;

    public DataSeeder(
            CategoryRepository categoryRepository,
            ProductRepository productRepository,
            ReviewRepository reviewRepository,
            UserRepository userRepository,
            CouponRepository couponRepository,
            PasswordEncoder passwordEncoder,
            ObjectMapper objectMapper,
            Environment environment,
            @Value("${app.admin.email:" + DEFAULT_ADMIN_EMAIL + "}") String adminEmail,
            @Value("${app.admin.password:" + DEFAULT_ADMIN_PASSWORD + "}") String adminPassword) {
        this.adminEmail = adminEmail == null || adminEmail.isBlank() ? DEFAULT_ADMIN_EMAIL : adminEmail.trim();
        String password = adminPassword == null || adminPassword.isBlank()
                ? DEFAULT_ADMIN_PASSWORD
                : adminPassword;
        this.prodProfile = environment.acceptsProfiles(Profiles.of("prod"));
        if (DEFAULT_ADMIN_PASSWORD.equals(password) && prodProfile) {
            throw new IllegalStateException("ADMIN_PASSWORD não configurado: o perfil 'prod' está ativo mas a "
                    + "password do administrador é a de desenvolvimento (pública no repositório). Defina "
                    + "ADMIN_PASSWORD (e, se aplicável, ADMIN_EMAIL) no ambiente.");
        }
        if (prodProfile && password.length() < 12) {
            throw new IllegalStateException("ADMIN_PASSWORD demasiado curta: use pelo menos 12 caracteres.");
        }
        this.adminPassword = password;
        this.categoryRepository = categoryRepository;
        this.productRepository = productRepository;
        this.reviewRepository = reviewRepository;
        this.userRepository = userRepository;
        this.couponRepository = couponRepository;
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
        ensureDemoCoupons();

        if (productRepository.count() > 0) {
            backfillMissingCreatedAt();
            log.info("Catálogo já existe — a semear não é necessário.");
            return;
        }

        log.info("Base de dados vazia — a semear catálogo…");
        SeedCatalog seed = objectMapper.readValue(
                new ClassPathResource("seed/catalog.json").getInputStream(), SeedCatalog.class);

        // Upsert das categorias: se a tabela de produtos estiver vazia mas as
        // categorias já existirem (ex.: um admin apagou todos os produtos), um
        // `saveAll` direto violava a chave primária (slug) e a exceção no
        // CommandLineRunner IMPEDIA a aplicação de arrancar (crash loop). Aqui só
        // são inseridas as que faltam.
        List<Category> missingCategories = seed.categories().stream()
                .filter(c -> c.getSlug() != null && !categoryRepository.existsById(c.getSlug()))
                .toList();
        categoryRepository.saveAll(missingCategories);
        // A ordem do ficheiro é a ordem do catálogo: o carimbo cresce com o
        // índice, pelo que o último produto do seed é o mais "recente" dele.
        Instant seedBase = seedBase();
        List<Product> seeded = new ArrayList<>();
        for (int i = 0; i < seed.products().size(); i++) {
            seeded.add(toProduct(seed.products().get(i), seedBase.plusSeconds(i * 60L)));
        }
        productRepository.saveAll(seeded);
        seedReviews(productRepository.findAll());

        log.info("Catálogo semeado: {} categorias, {} produtos, {} avaliações",
                seed.categories().size(), productRepository.count(), reviewRepository.count());
    }

    /** Garante a existência do utilizador administrador (idempotente). */
    private void ensureAdminUser() {
        Optional<UserAccount> existing = userRepository.findByEmailIgnoreCase(adminEmail);
        if (existing.isPresent()) {
            guardExistingAdminPassword(existing.get());
            return;
        }
        userRepository.save(UserAccount.builder()
                .email(adminEmail)
                .fullName("Administrador NorteShopMoz")
                .phone("+258 84 000 0001")
                .passwordHash(passwordEncoder.encode(adminPassword))
                .createdAt(Instant.now())
                .role("ADMIN")
                .build());
        log.info("Utilizador administrador criado: {}", adminEmail);
    }

    /**
     * Um administrador já existente pode ter sido criado por uma versão anterior
     * com a password pública do repositório — mudar {@code ADMIN_PASSWORD} não a
     * altera (o seeder não mexe em contas existentes). Em produção o arranque
     * falha com instruções, em vez de ficar com essa porta aberta.
     */
    private void guardExistingAdminPassword(UserAccount admin) {
        String hash = admin.getPasswordHash();
        if (!prodProfile || hash == null || hash.isBlank()) {
            return;
        }
        if (passwordEncoder.matches(DEFAULT_ADMIN_PASSWORD, hash)) {
            throw new IllegalStateException("O administrador " + adminEmail + " tem a password de "
                    + "desenvolvimento (pública no repositório). Altere-a antes de arrancar em produção "
                    + "(ex.: DELETE FROM users WHERE email = '" + adminEmail + "' e volte a arrancar com "
                    + "ADMIN_PASSWORD definido, ou use o fluxo de recuperação de password).");
        }
    }

    /**
     * Cupões de demonstração (idempotente) — permitem testar o checkout sem
     * criar nada no painel. O código é normalizado para maiúsculas.
     *
     * <p><strong>Nunca em produção</strong>: os códigos são públicos (estão no
     * repositório) e o limite de utilizações é ilimitado — em produção seriam uma
     * fuga de receita permanente. Se já existirem ativos (criados por um deploy
     * anterior), são desativados.</p>
     */
    private void ensureDemoCoupons() {
        if (prodProfile) {
            disableDemoCouponsInProduction();
            return;
        }
        seedCoupon(DEMO_COUPON_BEMVINDO, "PERCENT", new BigDecimal("10"), new BigDecimal("1000"), 0);
        seedCoupon(DEMO_COUPON_ENTREGA, "FIXED", new BigDecimal("500"), new BigDecimal("5000"), 0);
    }

    /**
     * Desativa cupões de demonstração que já existam em produção.
     *
     * <p>Idempotente e silenciosa quando não existem. Não os apaga: os pedidos
     * antigos ficam com o código registado, e o administrador pode reativá-los
     * conscientemente se quiser.</p>
     */
    private void disableDemoCouponsInProduction() {
        for (String code : List.of(DEMO_COUPON_BEMVINDO, DEMO_COUPON_ENTREGA)) {
            couponRepository.findByCodeIgnoreCase(code).ifPresent(coupon -> {
                if (coupon.isActive()) {
                    coupon.setActive(false);
                    couponRepository.save(coupon);
                    log.warn("[PROD] Cupão de demonstração '{}' desativado: os códigos de demonstração são "
                            + "públicos (estão no repositório) e não podem dar desconto em produção. "
                            + "Crie cupões próprios no painel de administração.", code);
                }
            });
        }
    }

    private void seedCoupon(
            String code, String discountType, BigDecimal discountValue,
            BigDecimal minimumSubtotal, int usageLimit) {
        if (couponRepository.findByCodeIgnoreCase(code).isPresent()) {
            return;
        }
        couponRepository.save(Coupon.builder()
                .code(code)
                .discountType(discountType)
                .discountValue(discountValue)
                .minimumSubtotal(minimumSubtotal)
                .active(true)
                .usageLimit(usageLimit)
                .usedCount(0)
                .build());
        log.info("Cupão de demonstração criado: {}", code);
    }

    /**
     * Momento base dos produtos do seed: há {@value #SEED_AGE_DAYS} dias, sempre
     * anterior a qualquer produto publicado no painel — garante que o último
     * produto a ser criado aparece em cima na loja.
     */
    private static final int SEED_AGE_DAYS = 120;

    private Instant seedBase() {
        return Instant.now().minus(Duration.ofDays(SEED_AGE_DAYS));
    }

    /**
     * Preenche o carimbo de criação dos produtos que ainda o não têm.
     *
     * <p>A coluna foi acrescentada depois de já existirem catálogos: essas linhas
     * ficam com {@code NULL} e um {@code ORDER BY created_at DESC} no Postgres
     * coloca os NULLs primeiro — os produtos antigos apareceriam em cima, o
     * contrário do pretendido. Os produtos do ficheiro de seed recebem a ordem do
     * ficheiro; os restantes (publicados no painel, sem histórico) por ordem de
     * id, mas sempre acima dos do seed. É idempotente: só corre quando há NULLs.
     */
    private void backfillMissingCreatedAt() {
        List<Product> missing = productRepository.findByCreatedAtIsNull();
        if (missing.isEmpty()) {
            return;
        }
        Map<String, Integer> seedIndex = new HashMap<>();
        try {
            SeedCatalog seed = objectMapper.readValue(
                    new ClassPathResource("seed/catalog.json").getInputStream(), SeedCatalog.class);
            for (int i = 0; i < seed.products().size(); i++) {
                seedIndex.put(seed.products().get(i).slug(), i);
            }
        } catch (IOException e) {
            log.warn("Não foi possível ler o seed para ordenar os carimbos antigos: {}", e.getMessage());
        }

        Instant base = seedBase();
        int published = 0;
        for (Product p : missing) {
            Integer index = seedIndex.get(p.getSlug());
            p.setCreatedAt(index != null
                    ? base.plusSeconds(index * 60L)
                    : Instant.now().minusSeconds(published++));
        }
        productRepository.saveAll(missing);
        log.info("Carimbo de criação preenchido para {} produtos (catálogo anterior à coluna)",
                missing.size());
    }

    private Product toProduct(SeedProduct s, Instant createdAt) {
        return Product.builder()
                .createdAt(createdAt)
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
                "Muito satisfeito com a compra. Recomendo a NorteShopMoz.",
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
