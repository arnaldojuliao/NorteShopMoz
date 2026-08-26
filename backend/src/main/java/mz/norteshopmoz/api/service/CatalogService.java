package mz.norteshopmoz.api.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import mz.norteshopmoz.api.domain.Category;
import mz.norteshopmoz.api.domain.Product;
import mz.norteshopmoz.api.domain.ProductSpec;
import mz.norteshopmoz.api.domain.ProductVariant;
import mz.norteshopmoz.api.domain.Review;
import mz.norteshopmoz.api.domain.VariantOption;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.CategoryRepository;
import mz.norteshopmoz.api.repository.OrderRepository;
import mz.norteshopmoz.api.repository.ProductRepository;
import mz.norteshopmoz.api.repository.ReviewRepository;
import mz.norteshopmoz.api.web.dto.ProductRequest;
import mz.norteshopmoz.api.web.dto.ReviewRequest;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Catálogo (leitura pesada e estável) — resultados em cache no Redis
 * com TTL de 15 minutos.
 */
@Service
@Transactional(readOnly = true)
public class CatalogService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final ReviewRepository reviewRepository;
    private final OrderRepository orderRepository;

    public CatalogService(
            ProductRepository productRepository,
            CategoryRepository categoryRepository,
            ReviewRepository reviewRepository,
            OrderRepository orderRepository) {
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
        this.reviewRepository = reviewRepository;
        this.orderRepository = orderRepository;
    }

    /**
     * Cria um produto (apenas admin) — gera id/slug únicos e aplica defaults
     * para os campos que o formulário não pede. Invalida o cache do catálogo.
     */
    @Transactional
    @CacheEvict(cacheNames = {"products", "product", "categories"}, allEntries = true)
    public Product createProduct(ProductRequest req) {
        if (!categoryRepository.existsById(req.category())) {
            throw ApiException.badRequest("Categoria inválida: " + req.category());
        }
        String slug = uniqueSlug(slugify(req.name()), null);

        List<String> images = req.images() == null || req.images().isEmpty()
                ? List.of()
                : req.images().stream().filter(s -> s != null && !s.isBlank()).toList();
        List<String> description = req.description() == null || req.description().isEmpty()
                ? List.of(req.shortDescription())
                : req.description();
        List<String> badges = req.badges() == null ? List.of() : req.badges();
        List<String> tags = req.tags() == null ? List.of() : req.tags();
        List<Integer> deliveryDays = req.deliveryDays() == null || req.deliveryDays().size() != 2
                ? List.of(3, 7)
                : req.deliveryDays();

        Product product = Product.builder()
                .id("p-" + UUID.randomUUID().toString().substring(0, 8))
                .slug(slug)
                .name(req.name().trim())
                .brand(req.brand() == null || req.brand().isBlank() ? null : req.brand().trim())
                .category(req.category())
                .price(req.price())
                .oldPrice(req.oldPrice())
                .rating(0)
                .ratingCount(0)
                .sold(0)
                .stock(req.stock())
                .images(images)
                .shortDescription(req.shortDescription().trim())
                .description(description)
                .specs(req.specs() == null ? new ArrayList<>()
                        : req.specs().stream()
                                .map(s -> new ProductSpec(s.label(), s.value()))
                                .toList())
                .badges(badges)
                .featured(Boolean.TRUE.equals(req.featured()))
                .bestseller(Boolean.TRUE.equals(req.bestseller()))
                .isNew(Boolean.TRUE.equals(req.isNew()))
                .dealOfDay(Boolean.TRUE.equals(req.dealOfDay()))
                .variants(req.variants() == null ? new ArrayList<>()
                        : req.variants().stream()
                                .map(v -> new ProductVariant(v.type(),
                                        v.options() == null ? new ArrayList<>()
                                                : v.options().stream()
                                                        .map(o -> new VariantOption(o.name(), o.hex()))
                                                        .toList()))
                                .toList())
                .deliveryDays(deliveryDays)
                .freeShipping(Boolean.TRUE.equals(req.freeShipping()))
                .tags(tags)
                .build();

        return productRepository.save(product);
    }

    /** Slug amigável a partir do nome (minúsculas, sem acentos, hífens). */
    private static String slugify(String name) {
        String normalized = java.text.Normalizer.normalize(name, java.text.Normalizer.Form.NFD)
                .replaceAll("[\\p{InCombiningDiacriticalMarks}]", "")
                .toLowerCase(Locale.ROOT);
        String slug = normalized.replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        return slug.isBlank() ? "produto" : slug;
    }

    /**
     * Slug único: acrescenta um sufixo curto se já existir. `excludeId`
     * ignora o próprio produto (usado ao renomear sem colidir consigo).
     */
    private String uniqueSlug(String base, String excludeId) {
        String candidate = base;
        int i = 2;
        while (productRepository.findBySlug(candidate)
                .map(p -> !p.getId().equals(excludeId))
                .orElse(false)) {
            candidate = base + "-" + i++;
        }
        return candidate;
    }

    /**
     * Atualiza um produto existente (apenas admin). Se o nome mudar, o slug é
     * regenerado (mantendo unicidade); os restantes campos são substituídos na
     * íntegra pelo payload. Invalida o cache do catálogo.
     */
    @Transactional
    @CacheEvict(cacheNames = {"products", "product", "categories"}, allEntries = true)
    public Product updateProduct(String id, ProductRequest req) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Produto não encontrado"));
        if (!categoryRepository.existsById(req.category())) {
            throw ApiException.badRequest("Categoria inválida: " + req.category());
        }

        List<String> images = req.images() == null ? List.of()
                : req.images().stream().filter(s -> s != null && !s.isBlank()).toList();
        List<String> description = req.description() == null || req.description().isEmpty()
                ? List.of(req.shortDescription())
                : req.description();

        String newName = req.name().trim();
        boolean nameChanged = !newName.equals(product.getName());
        product.setName(newName);
        // Slug só muda se o nome mudar (URLs estáveis para produtos já partilhados).
        if (nameChanged) {
            product.setSlug(uniqueSlug(slugify(newName), id));
        }
        product.setBrand(req.brand() == null || req.brand().isBlank() ? null : req.brand().trim());
        product.setCategory(req.category());
        product.setPrice(req.price());
        product.setOldPrice(req.oldPrice());
        product.setStock(req.stock());
        product.setImages(images);
        product.setShortDescription(req.shortDescription().trim());
        product.setDescription(description);
        product.setSpecs(req.specs() == null ? new ArrayList<>()
                : req.specs().stream()
                        .map(s -> new ProductSpec(s.label(), s.value()))
                        .toList());
        product.setBadges(req.badges() == null ? List.of() : req.badges());
        product.setFeatured(Boolean.TRUE.equals(req.featured()));
        product.setBestseller(Boolean.TRUE.equals(req.bestseller()));
        product.setNew(Boolean.TRUE.equals(req.isNew()));
        product.setDealOfDay(Boolean.TRUE.equals(req.dealOfDay()));
        product.setVariants(req.variants() == null ? new ArrayList<>()
                : req.variants().stream()
                        .map(v -> new ProductVariant(v.type(),
                                v.options() == null ? new ArrayList<>()
                                        : v.options().stream()
                                                .map(o -> new VariantOption(o.name(), o.hex()))
                                                .toList()))
                        .toList());
        product.setDeliveryDays(req.deliveryDays() == null || req.deliveryDays().size() != 2
                ? List.of(3, 7)
                : req.deliveryDays());
        product.setFreeShipping(Boolean.TRUE.equals(req.freeShipping()));
        product.setTags(req.tags() == null ? List.of() : req.tags());

        return productRepository.save(product);
    }

    /** Remove um produto (apenas admin). Avaliações do produto são apagadas em cascata lógica. */
    @Transactional
    @CacheEvict(cacheNames = {"products", "product", "categories", "reviews"}, allEntries = true)
    public void deleteProduct(String id) {
        if (!productRepository.existsById(id)) {
            throw ApiException.notFound("Produto não encontrado");
        }
        productRepository.deleteById(id);
    }

    @Cacheable(cacheNames = "products", key = "#query")
    public List<Product> getProducts(ProductQuery query) {
        List<Product> products = productRepository.findAll(
                ProductSpecifications.from(query), toSort(query.sort()));
        if (query.limit() != null && query.limit() > 0 && products.size() > query.limit()) {
            return List.copyOf(products.subList(0, query.limit()));
        }
        return products;
    }

    /** Nº total de correspondências (para o meta.total do contrato, mesmo com limit). */
    public long countProducts(ProductQuery query) {
        return productRepository.count(ProductSpecifications.from(query));
    }

    @Cacheable(cacheNames = "product", key = "#slug")
    public Product getProduct(String slug) {
        return productRepository.findBySlug(slug)
                .orElseThrow(() -> ApiException.notFound("Produto não encontrado"));
    }

    /**
     * Categorias com contagem de produtos — uma única query GROUP BY
     * (evita N+1) e o resultado completo fica em cache.
     */
    @Cacheable(cacheNames = "categories", key = "'all'")
    public List<CategorySummary> getCategorySummaries() {
        List<Category> categories = categoryRepository.findAll(Sort.by(Sort.Direction.ASC, "slug"));
        Map<String, Long> counts = productRepository.countProductsGroupedByCategory().stream()
                .collect(Collectors.toMap(row -> (String) row[0], row -> (Long) row[1]));
        return categories.stream()
                .map(c -> new CategorySummary(
                        c.getSlug(),
                        c.getName(),
                        c.getEmoji(),
                        c.getImage(),
                        c.getDescription(),
                        counts.getOrDefault(c.getSlug(), 0L)))
                .toList();
    }

    @Cacheable(cacheNames = "reviews", key = "#productId")
    public List<Review> getReviews(String productId) {
        return reviewRepository.findByProductIdOrderByDateDesc(productId);
    }

    /**
     * Regista uma avaliação (cliente autenticado). O selo "Compra verificada" é
     * atribuído se o utilizador já comprou este produto. Invalida o cache de
     * reviews e do produto (rating atualizado).
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = "reviews", key = "#productId"),
            @CacheEvict(cacheNames = "product", key = "#slug")
    })
    public Review addReview(String slug, String productId, String userId, String author, ReviewRequest req) {
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> ApiException.notFound("Produto não encontrado"));
        boolean verified = userId != null && orderRepository.hasOrderedProduct(userId, productId);

        Review review = Review.builder()
                .product(product)
                .author(author == null || author.isBlank() ? "Cliente" : author)
                .rating(req.rating())
                .date(Instant.now())
                .title(req.title())
                .comment(req.comment().trim())
                .verified(verified)
                .build();
        Review saved = reviewRepository.save(review);

        // Atualiza a média do produto (ratingCount + 1).
        int count = product.getRatingCount() + 1;
        double avg = (product.getRating() * product.getRatingCount() + req.rating()) / (double) count;
        product.setRatingCount(count);
        product.setRating(Math.round(avg * 10.0) / 10.0);
        productRepository.save(product);

        return saved;
    }

    /** Contrato de categoria do frontend + productCount. */
    public record CategorySummary(
            String slug,
            String name,
            String emoji,
            String image,
            String description,
            long productCount) {}

    private Sort toSort(String sort) {
        return switch (sort == null ? "relevance" : sort) {
            case "price-asc" -> Sort.by(Sort.Direction.ASC, "price");
            case "price-desc" -> Sort.by(Sort.Direction.DESC, "price");
            case "rating" -> Sort.by(Sort.Direction.DESC, "rating");
            case "sold" -> Sort.by(Sort.Direction.DESC, "sold");
            default -> Sort.by(Sort.Direction.ASC, "id");
        };
    }
}
