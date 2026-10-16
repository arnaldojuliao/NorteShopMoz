package mz.norteshopmoz.api.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import mz.norteshopmoz.api.domain.Product;
import mz.norteshopmoz.api.domain.StockMovement;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.ProductRepository;
import mz.norteshopmoz.api.repository.StockMovementRepository;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gestão de inventário pela operação.
 *
 * <p>O stock até aqui só mudava por compra/cancelamento — para corrigir uma
 * contagem física era preciso editar o produto inteiro. Este serviço permite o
 * ajuste direto (com o delta calculado do valor atual) e mantém o histórico de
 * movimentos: cada alteração (compra, cancelamento, ajuste manual) fica em
 * {@code stock_movements}, para responder "porquê este stock?" sem adivinhar.</p>
 *
 * <p>Alerta de stock baixo: lista produtos no/abaixo do limite para o painel
 * (repor antes de vender em falta).</p>
 */
@Service
public class StockService {

    /** Limite por omissão do alerta de stock baixo (o frontend pode pedir outro). */
    public static final int DEFAULT_LOW_STOCK_THRESHOLD = 10;

    private static final int MAX_LOW_STOCK_THRESHOLD = 1000;

    private final ProductRepository productRepository;
    private final StockMovementRepository movementRepository;

    public StockService(ProductRepository productRepository, StockMovementRepository movementRepository) {
        this.productRepository = productRepository;
        this.movementRepository = movementRepository;
    }

    /**
     * Ajusta o stock absoluto de um produto (contagem física, encomenda
     * recebida, correção). Regista o movimento e invalida a cache do catálogo
     * (o stock visível na loja tem de mudar já).
     */
    @Transactional
    @CacheEvict(cacheNames = {"products", "product"}, allEntries = true)
    public Map<String, Object> adjustStock(String productId, int newStock, String detail, String adminId) {
        if (newStock < 0) {
            throw ApiException.badRequest("Stock não pode ser negativo");
        }
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> ApiException.notFound("Produto não encontrado: " + productId));
        int current = product.getStock();
        if (newStock == current) {
            throw ApiException.conflict("O stock já é " + newStock);
        }
        product.setStock(newStock);
        productRepository.save(product);
        movementRepository.save(StockMovement.builder()
                .productId(productId)
                .delta(newStock - current)
                .stockAfter(newStock)
                .reason(StockMovement.REASON_MANUAL)
                .detail(detail == null || detail.isBlank() ? null : detail.trim())
                .userId(adminId)
                .build());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("productId", productId);
        result.put("previousStock", current);
        result.put("stock", newStock);
        result.put("delta", newStock - current);
        return result;
    }

    /**
     * Regista um movimento automático (checkout/cancelamento). Guardado dentro
     * da transação do próprio pedido — se o pedido reverter, o movimento reverte
     * com ele. {@code stockAfter} fica null (ler o stock de novo seria uma
     * consulta extra por produto em cada checkout; a coluna é informativa).
     */
    @Transactional
    public void recordAutomatic(String productId, int delta, String reason, String detail) {
        movementRepository.save(StockMovement.builder()
                .productId(productId)
                .delta(delta)
                .reason(reason)
                .detail(detail)
                .build());
    }

    /** Produtos no/abaixo do limite (alerta do painel). */
    @Transactional(readOnly = true)
    public List<Product> lowStock(Integer threshold) {
        int safe = threshold == null || threshold < 0
                ? DEFAULT_LOW_STOCK_THRESHOLD
                : Math.min(threshold, MAX_LOW_STOCK_THRESHOLD);
        return productRepository.findByStockLessThanEqualOrderByStockAsc(safe);
    }

    /** Histórico de movimentos — por produto ou global (mais recentes primeiro). */
    @Transactional(readOnly = true)
    public Map<String, Object> movements(String productId, int limit) {
        int safeLimit = limit <= 0 ? 50 : Math.min(limit, 200);
        List<StockMovement> movements = productId == null || productId.isBlank()
                ? movementRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, safeLimit, Sort.unsorted()))
                : movementRepository.findByProductIdOrderByCreatedAtDesc(productId, PageRequest.of(0, safeLimit));
        return new LinkedHashMap<>(Map.of("movements", movements));
    }
}
