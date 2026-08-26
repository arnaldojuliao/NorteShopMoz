package mz.norteshopmoz.api.web.dto;

/** Item de carrinho enviado pelo cliente — o servidor recalcula o resto do catálogo. */
public record CartItemRequest(String productId, int qty, String variant) {
}
