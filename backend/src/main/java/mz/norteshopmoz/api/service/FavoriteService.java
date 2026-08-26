package mz.norteshopmoz.api.service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import mz.norteshopmoz.api.domain.Favorite;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.FavoriteRepository;
import mz.norteshopmoz.api.repository.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Favoritos por utilizador. A lista é substituída (PUT) — o frontend guarda
 * apenas IDs e resolve os detalhes do produto a partir do catálogo.
 */
@Service
public class FavoriteService {

    private final FavoriteRepository favoriteRepository;
    private final ProductRepository productRepository;

    public FavoriteService(FavoriteRepository favoriteRepository, ProductRepository productRepository) {
        this.favoriteRepository = favoriteRepository;
        this.productRepository = productRepository;
    }

    @Transactional(readOnly = true)
    public List<String> getFavorites(String userId) {
        return favoriteRepository.findByUserIdOrderByProductId(userId).stream()
                .map(Favorite::getProductId)
                .toList();
    }

    /**
     * Substitui a lista de favoritos do utilizador.
     * IDs repetidos são colapsados; um ID fora do catálogo → 400.
     */
    @Transactional
    public List<String> replaceFavorites(String userId, List<String> productIds) {
        List<String> cleaned = new ArrayList<>(new LinkedHashSet<>(productIds == null ? List.of() : productIds));
        for (String productId : cleaned) {
            if (!productRepository.existsById(productId)) {
                throw ApiException.badRequest("Produto não encontrado no catálogo: " + productId);
            }
        }
        favoriteRepository.deleteByUserId(userId);
        Set<Favorite> toSave = new LinkedHashSet<>();
        for (String productId : cleaned) {
            toSave.add(Favorite.builder().userId(userId).productId(productId).build());
        }
        favoriteRepository.saveAll(toSave);
        return cleaned;
    }
}
