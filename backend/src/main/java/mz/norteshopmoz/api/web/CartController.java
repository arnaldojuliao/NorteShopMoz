package mz.norteshopmoz.api.web;

import java.util.List;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.CartService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import mz.norteshopmoz.api.web.dto.CartItemRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Carrinho por utilizador (JWT) ou convidado (header {@code X-Guest-Id}, ex.:
 * um UUID gerado no dispositivo) — GET /api/cart (itens com preços do catálogo)
 * e PUT /api/cart (substituição completa). Sem identidade → 401.
 */
@RestController
@RequestMapping("/api/cart")
public class CartController {

    private static final String GUEST_PREFIX = "guest:";

    private final CartService cartService;

    public CartController(CartService cartService) {
        this.cartService = cartService;
    }

    @GetMapping
    public ResponseEntity<?> getCart(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestHeader(name = "X-Guest-Id", required = false) String guestId) {
        String cartKey = resolveCartKey(principal, guestId);
        return ResponseEntity.ok(ApiResponse.data(cartService.getCart(cartKey)));
    }

    @PutMapping
    public ResponseEntity<?> replaceCart(
            @RequestBody(required = false) List<CartItemRequest> requests,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestHeader(name = "X-Guest-Id", required = false) String guestId) {
        String cartKey = resolveCartKey(principal, guestId);
        return ResponseEntity.ok(ApiResponse.data(cartService.replaceCart(cartKey, requests)));
    }

    /**
     * Identidade do carrinho: utilizador autenticado tem prioridade; senão o
     * convidado (prefixado para nunca colidir com IDs de utilizador).
     */
    private String resolveCartKey(UserPrincipal principal, String guestId) {
        if (principal != null) {
            return principal.id();
        }
        if (guestId != null && !guestId.isBlank()) {
            return GUEST_PREFIX + guestId;
        }
        throw ApiException.unauthorized("Forneça um token JWT ou X-Guest-Id");
    }
}
