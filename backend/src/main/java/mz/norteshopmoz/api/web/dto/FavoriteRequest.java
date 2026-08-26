package mz.norteshopmoz.api.web.dto;

import java.util.List;

/** Payload de favoritos — lista de IDs de produtos (substituição completa). */
public record FavoriteRequest(List<String> productIds) {
}
