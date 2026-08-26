package mz.norteshopmoz.api.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Payload de um endereço de entrega (GET/PUT /api/addresses — autenticado). */
public record AddressRequest(
        @Size(max = 60, message = "Identificação demasiado longa") String label,
        @NotBlank(message = "Nome completo é obrigatório") @Size(max = 80) String fullName,
        @NotBlank(message = "Telefone é obrigatório") @Size(max = 40) String phone,
        @NotBlank(message = "Endereço é obrigatório") @Size(max = 200) String address,
        @NotBlank(message = "Cidade é obrigatória") @Size(max = 80) String city,
        @NotBlank(message = "Província é obrigatória") @Size(max = 80) String province,
        Boolean isDefault,
        Double lat,
        Double lng) {}
