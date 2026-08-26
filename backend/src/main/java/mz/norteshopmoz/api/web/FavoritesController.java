package mz.norteshopmoz.api.web;

import java.util.List;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.FavoriteService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import mz.norteshopmoz.api.web.dto.FavoriteRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Favoritos por utilizador — GET /api/favorites (lista de IDs) e
 * PUT /api/favorites (substituição completa). Requer token JWT.
 */
@RestController
@RequestMapping("/api/favorites")
public class FavoritesController {

    private final FavoriteService favoriteService;

    public FavoritesController(FavoriteService favoriteService) {
        this.favoriteService = favoriteService;
    }

    @GetMapping
    public ResponseEntity<?> getFavorites(@AuthenticationPrincipal UserPrincipal principal) {
        requireAuth(principal);
        return ResponseEntity.ok(ApiResponse.data(favoriteService.getFavorites(principal.id())));
    }

    @PutMapping
    public ResponseEntity<?> replaceFavorites(
            @RequestBody(required = false) FavoriteRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAuth(principal);
        List<String> productIds = request == null ? List.of() : request.productIds();
        return ResponseEntity.ok(ApiResponse.data(favoriteService.replaceFavorites(principal.id(), productIds)));
    }

    private void requireAuth(UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
    }
}
