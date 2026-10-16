package mz.norteshopmoz.api.service;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import mz.norteshopmoz.api.domain.Category;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.CategoryRepository;
import mz.norteshopmoz.api.repository.ProductRepository;
import mz.norteshopmoz.api.web.dto.CategoryRequest;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * CRUD de categorias pela operação (painel admin).
 *
 * <p>Até agora as categorias só mudavam por migration Flyway (V9) — o admin não
 * conseguia criar uma categoria nova para um produto que ia publicar. Todas as
 * mutações invalidam a cache do catálogo ({@code categories}, {@code products}
 * e {@code product}), que é onde o frontend lê as contagens.</p>
 *
 * <p>O slug é a chave primária e é referenciado por todos os produtos: não é
 * mutável (mudá-lo deixava produtos órfãos). Apagar só é permitido com a
 * categoria vazia — o erro 409 diz o que fazer.</p>
 */
@Service
public class AdminCategoryService {

    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;

    public AdminCategoryService(CategoryRepository categoryRepository, ProductRepository productRepository) {
        this.categoryRepository = categoryRepository;
        this.productRepository = productRepository;
    }

    /** Lista completa, ordenada por slug (igual ao endpoint público). */
    @Transactional(readOnly = true)
    public List<Category> list() {
        return categoryRepository.findAll(Sort.by(Sort.Direction.ASC, "slug"));
    }

    @Transactional
    @CacheEvict(cacheNames = {"products", "product", "categories"}, allEntries = true)
    public Category create(CategoryRequest req) {
        String name = requireText(req.name(), "Nome é obrigatório");
        String slug = req.slug() == null || req.slug().isBlank()
                ? slugify(name)
                : slugify(req.slug());
        if (categoryRepository.existsById(slug)) {
            throw ApiException.conflict("Já existe uma categoria com o slug: " + slug);
        }
        Category category = Category.builder()
                .slug(slug)
                .name(name)
                .emoji(trimToNull(req.emoji()))
                .image(trimToNull(req.image()))
                .description(trimToNull(req.description()))
                .build();
        return categoryRepository.save(category);
    }

    @Transactional
    @CacheEvict(cacheNames = {"products", "product", "categories"}, allEntries = true)
    public Category update(String slug, CategoryRequest req) {
        Category category = categoryRepository.findById(slug)
                .orElseThrow(() -> ApiException.notFound("Categoria não encontrada: " + slug));
        if (req.name() != null && !req.name().isBlank()) {
            category.setName(req.name().trim());
        }
        category.setEmoji(trimToNull(req.emoji()));
        category.setImage(trimToNull(req.image()));
        category.setDescription(trimToNull(req.description()));
        return categoryRepository.save(category);
    }

    @Transactional
    @CacheEvict(cacheNames = {"products", "product", "categories"}, allEntries = true)
    public Map<String, Object> delete(String slug) {
        if (!categoryRepository.existsById(slug)) {
            throw ApiException.notFound("Categoria não encontrada: " + slug);
        }
        long productsInCategory = productRepository.countByCategory(slug);
        if (productsInCategory > 0) {
            // Recusa em vez de apagar produtos em cascata: uma categoria com
            // produtos não é um acidente — mover os produtos é uma decisão.
            throw ApiException.conflict("A categoria tem " + productsInCategory
                    + " produto(s). Mova-os para outra categoria antes de apagar.");
        }
        categoryRepository.deleteById(slug);
        return Map.of("deleted", true, "slug", slug);
    }

    private static String requireText(String value, String message) {
        if (value == null || value.isBlank()) {
            throw ApiException.badRequest(message);
        }
        return value.trim();
    }

    private static String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    /**
     * Slug amigável: minúsculas, sem acentos, espaços → hífenes
     * (mesma regra dos produtos, para o frontend não ver dois formatos).
     */
    private static String slugify(String value) {
        String normalized = Normalizer.normalize(value.toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        String slug = normalized.replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (slug.isBlank()) {
            throw ApiException.badRequest("Não foi possível gerar um slug válido a partir de: " + value);
        }
        return slug;
    }
}
