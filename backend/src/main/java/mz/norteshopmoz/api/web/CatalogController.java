package mz.norteshopmoz.api.web;

import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.util.List;
import mz.norteshopmoz.api.config.ShippingConfig;
import mz.norteshopmoz.api.domain.Product;
import mz.norteshopmoz.api.domain.Review;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.CatalogService;
import mz.norteshopmoz.api.service.ProductQuery;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import mz.norteshopmoz.api.web.dto.ProductRequest;
import mz.norteshopmoz.api.web.dto.ReviewRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Catálogo público — espelha o contrato GET /api/products do frontend. */
@RestController
@RequestMapping("/api")
public class CatalogController {

    private final CatalogService catalogService;
    private final ShippingConfig shippingConfig;

    public CatalogController(CatalogService catalogService, ShippingConfig shippingConfig) {
        this.catalogService = catalogService;
        this.shippingConfig = shippingConfig;
    }

    /**
     * Publica um novo produto — apenas administradores (role ADMIN, verificado
     * aqui e no SecurityConfig). Invalida o cache do catálogo para a loja ver
     * o produto de imediato.
     */
    @PostMapping("/products")
    public ResponseEntity<?> createProduct(
            @Valid @RequestBody ProductRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        Product product = catalogService.createProduct(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(product));
    }

    /**
     * Atualiza um produto existente (PUT /api/products/{id}) — apenas admin.
     * O id é o identificador interno ("p-…"); se o nome mudar, o slug é
     * regenerado pelo serviço.
     */
    @PutMapping("/products/{id}")
    public ResponseEntity<?> updateProduct(
            @PathVariable String id,
            @Valid @RequestBody ProductRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        return ResponseEntity.ok(ApiResponse.data(catalogService.updateProduct(id, request)));
    }

    /** Remove um produto (DELETE /api/products/{id}) — apenas admin. */
    @DeleteMapping("/products/{id}")
    public ResponseEntity<?> deleteProduct(
            @PathVariable String id,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        catalogService.deleteProduct(id);
        return ResponseEntity.ok(ApiResponse.data(java.util.Map.of("deleted", true)));
    }

    /** Verificação partilhada das rotas de escrita do catálogo. */
    private static void requireAdmin(UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
        if (!"ADMIN".equalsIgnoreCase(principal.role())) {
            throw ApiException.forbidden("Apenas administradores podem gerir produtos");
        }
    }

    /**
     * Regras de envio (limite de entrega grátis + províncias com taxa e prazo) —
     * consumido pelo frontend para nunca duplicar estas regras entre camadas.
     */
    @GetMapping("/shipping")
    public ResponseEntity<?> getShipping() {
        return ResponseEntity.ok(ApiResponse.data(new ShippingPayload(
                ShippingConfig.FREE_SHIPPING_THRESHOLD,
                shippingConfig.provinces().stream()
                        .map(p -> new ProvincePayload(p.name(), p.fee(), p.minDays(), p.maxDays()))
                        .toList())));
    }

    private record ShippingPayload(BigDecimal freeShippingThreshold, List<ProvincePayload> provinces) {}

    private record ProvincePayload(String name, BigDecimal fee, int minDays, int maxDays) {}

    @GetMapping("/products")
    public ResponseEntity<?> listProducts(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false, defaultValue = "0") boolean featured,
            @RequestParam(required = false, defaultValue = "0") boolean bestseller,
            @RequestParam(required = false, defaultValue = "0") boolean isNew,
            @RequestParam(required = false, defaultValue = "0") boolean deal,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) Integer limit) {

        ProductQuery query = new ProductQuery(
                category, q, sort, featured, bestseller, isNew, deal, minPrice, maxPrice, limit);

        List<Product> products = catalogService.getProducts(query);
        // meta.total = total de correspondências (mesmo com limit)
        long total = query.limit() == null ? products.size() : catalogService.countProducts(query);
        return ResponseEntity.ok(ApiResponse.list(products, total));
    }

    @GetMapping("/products/{slug}")
    public ResponseEntity<?> getProduct(@PathVariable String slug) {
        return ResponseEntity.ok(ApiResponse.data(catalogService.getProduct(slug)));
    }

    @GetMapping("/products/{slug}/reviews")
    public ResponseEntity<?> getReviews(@PathVariable String slug) {
        Product product = catalogService.getProduct(slug);
        return ResponseEntity.ok(ApiResponse.data(catalogService.getReviews(product.getId())));
    }

    /**
     * Regista uma avaliação — qualquer cliente autenticado (token JWT).
     * O selo "Compra verificada" é atribuído automaticamente se o cliente
     * já comprou o produto (ver CatalogService.addReview).
     */
    @PostMapping("/products/{slug}/reviews")
    public ResponseEntity<?> addReview(
            @PathVariable String slug,
            @Valid @RequestBody ReviewRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Entre na sua conta para avaliar produtos");
        }
        Product product = catalogService.getProduct(slug);
        Review review = catalogService.addReview(
                slug, product.getId(), principal.id(), principal.fullName(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(review));
    }

    @GetMapping("/categories")
    public ResponseEntity<?> getCategories() {
        return ResponseEntity.ok(ApiResponse.data(catalogService.getCategorySummaries()));
    }
}
