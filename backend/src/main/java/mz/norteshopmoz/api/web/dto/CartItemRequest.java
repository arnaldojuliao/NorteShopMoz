package mz.norteshopmoz.api.web.dto;

import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Min;

/**
 * Item de carrinho enviado pelo cliente — o servidor recalcula o resto do catálogo.
 *
 * <p><strong>Limites de tamanho</strong>: o carrinho é um endpoint público (convidado
 * via X-Guest-Id). Sem teto na lista e nas strings, um payload enorme gerava um
 * número ilimitado de leituras de catálogo (amplificação) e rebentava com 500 na
 * coluna {@code variant}. O colapso de itens duplicados no serviço é limitado a 99,
 * mas a lista em si não tinha limite — agora tem.</p>
 */
public record CartItemRequest(
        @Size(max = 40, message = "Identificador de produto demasiado longo") String productId,
        @Min(value = 0, message = "Quantidade inválida") int qty,
        @Size(max = 60, message = "Variante demasiado longa") String variant) {
}
