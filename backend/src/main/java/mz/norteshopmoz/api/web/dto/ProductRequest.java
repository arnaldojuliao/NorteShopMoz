package mz.norteshopmoz.api.web.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;

/**
 * Payload de criação de produto (POST /api/products — apenas admin).
 * Espelha o contrato {@code Product} do frontend; campos opcionais ficam com
 * valores por omissão no servidor (rating, sold, flags, etc.).
 */
public record ProductRequest(
        @NotBlank(message = "Nome é obrigatório") @Size(max = 200, message = "Nome demasiado longo") String name,
        @Size(max = 60, message = "Marca demasiado longa") String brand,
        @NotBlank(message = "Categoria é obrigatória") String category,
        @NotNull(message = "Preço é obrigatório") @DecimalMin(value = "0.01", message = "Preço inválido") BigDecimal price,
        @DecimalMin(value = "0.01", message = "Preço antigo inválido") BigDecimal oldPrice,
        @Min(value = 0, message = "Stock inválido") int stock,
        @NotBlank(message = "Descrição curta é obrigatória") @Size(max = 300, message = "Descrição curta demasiado longa") String shortDescription,
        List<String> description,
        List<String> images,
        List<String> tags,
        List<String> badges,
        List<SpecRequest> specs,
        List<VariantRequest> variants,
        @Size(min = 2, max = 2, message = "Dias de entrega deve ser [min, max]") List<Integer> deliveryDays,
        Boolean featured,
        Boolean bestseller,
        Boolean isNew,
        Boolean dealOfDay,
        Boolean freeShipping) {

    public record SpecRequest(String label, String value) {}

    public record VariantRequest(String type, List<OptionRequest> options) {}

    public record OptionRequest(String name, String hex) {}
}
