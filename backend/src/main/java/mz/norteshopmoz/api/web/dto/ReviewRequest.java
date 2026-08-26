package mz.norteshopmoz.api.web.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Payload de criação de avaliação (POST /api/products/{slug}/reviews — autenticado). */
public record ReviewRequest(
        @NotNull(message = "Dê uma classificação (1 a 5 estrelas)")
        @Min(value = 1, message = "Classificação mínima: 1 estrela")
        @Max(value = 5, message = "Classificação máxima: 5 estrelas")
        Integer rating,
        @Size(max = 120, message = "Título demasiado longo") String title,
        @NotBlank(message = "Escreva o seu comentário")
        @Size(max = 600, message = "Comentário demasiado longo (máx. 600 caracteres)")
        String comment) {}
