package mz.norteshopmoz.api.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import mz.norteshopmoz.api.domain.CartItem;
import mz.norteshopmoz.api.domain.Product;
import mz.norteshopmoz.api.domain.UserCart;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.CartRepository;
import mz.norteshopmoz.api.repository.ProductRepository;
import mz.norteshopmoz.api.web.dto.CartItemRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Carrinho por utilizador. Como nos pedidos, os preços são sempre recalculados
 * a partir do catálogo — o payload do cliente só identifica (productId, qty, variant).
 */
@Service
public class CartService {

    private static final int MAX_QTY = 99;

    private final CartRepository cartRepository;
    private final ProductRepository productRepository;

    public CartService(CartRepository cartRepository, ProductRepository productRepository) {
        this.cartRepository = cartRepository;
        this.productRepository = productRepository;
    }

    /**
     * Substitui o carrinho de um utilizador (ou convidado). Itens do mesmo
     * produto/variante são colapsados (quantidades somadas); preço/nome/imagem
     * vêm do catálogo.
     */
    @Transactional(readOnly = true)
    public List<CartItem> getCart(String cartKey) {
        return cartRepository.findById(cartKey)
                .map(UserCart::getItems)
                .orElse(List.of());
    }

    @Transactional
    public List<CartItem> replaceCart(String cartKey, List<CartItemRequest> requests) {
        List<CartItemRequest> input = requests == null ? List.of() : requests;

        // Colapsa por (productId, variant) para não duplicar linhas.
        Map<String, CartItemRequest> collapsed = new LinkedHashMap<>();
        for (CartItemRequest req : input) {
            String key = req.productId() + "|" + (req.variant() == null ? "" : req.variant());
            collapsed.merge(key, req, (a, b) -> new CartItemRequest(
                    a.productId(), Math.min(MAX_QTY, a.qty() + b.qty()), b.variant()));
        }

        List<CartItem> items = new ArrayList<>();
        for (CartItemRequest req : collapsed.values()) {
            Product product = resolveProduct(req.productId());
            int qty = Math.min(MAX_QTY, Math.max(1, req.qty()));
            if (product.getStock() > 0 && qty > product.getStock()) {
                qty = product.getStock();
            }
            items.add(CartItem.builder()
                    .productId(product.getId())
                    .slug(product.getSlug())
                    .name(product.getName())
                    .image(product.getImages() != null && !product.getImages().isEmpty()
                            ? product.getImages().get(0)
                            : null)
                    .price(product.getPrice())
                    .oldPrice(product.getOldPrice())
                    .qty(qty)
                    .variant(req.variant())
                    .freeShipping(product.isFreeShipping())
                    .build());
        }

        UserCart cart = cartRepository.findById(cartKey)
                .orElse(UserCart.builder().userId(cartKey).build());
        cart.setItems(items);
        cartRepository.save(cart);
        return items;
    }

    private Product resolveProduct(String productId) {
        return productRepository.findById(productId)
                .orElseThrow(() -> ApiException.badRequest("Produto não encontrado no catálogo: " + productId));
    }
}
