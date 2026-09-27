package mz.norteshopmoz.api.web;

import jakarta.validation.Valid;
import java.util.List;
import java.util.regex.Pattern;
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

    /**
     * Formato aceite para o {@code X-Guest-Id}: o UUID gerado pelo dispositivo
     * (36 caracteres) ou o fallback antigo {@code guest-…}. Limita o tamanho à
     * coluna ({@code user_carts.user_id} tem 64 caracteres, pelo que sem isto um
     * header longo rebentava com 500) e recusa caracteres que não têm lugar
     * numa chave. Não é um segredo — a entropia do UUID é que impede adivinhar
     * carrinhos alheios.
     */
    private static final Pattern GUEST_ID = Pattern.compile("^[A-Za-z0-9_-]{8,48}$");

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
            @Valid @RequestBody(required = false) List<CartItemRequest> requests,
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
            if (!GUEST_ID.matcher(guestId).matches()) {
                throw ApiException.badRequest("Identificador de convidado inválido");
            }
            return GUEST_PREFIX + guestId;
        }
        throw ApiException.unauthorized("Forneça um token JWT ou X-Guest-Id");
    }
}
