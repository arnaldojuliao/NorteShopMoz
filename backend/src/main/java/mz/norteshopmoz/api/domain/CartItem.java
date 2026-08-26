package mz.norteshopmoz.api.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.math.BigDecimal;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Linha de carrinho (contrato do frontend: productId, slug, name, image, price, qty, variant?). */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class CartItem {

    private String productId;

    private String slug;

    private String name;

    private String image;

    private BigDecimal price;

    /** Preço antigo (para mostrar o desconto no carrinho). */
    private BigDecimal oldPrice;

    private int qty;

    private String variant;

    private boolean freeShipping;
}
