package mz.norteshopmoz.api.web.dto;

import jakarta.validation.constraints.Size;

/**
 * Payload de criação/edição de categoria (admin).
 * O slug é opcional na criação (gerado do nome) e ignorado na edição
 * (a chave primária não muda — os produtos referenciam-no).
 */
public record CategoryRequest(
        @Size(max = 60, message = "Slug demasiado longo") String slug,
        @Size(max = 80, message = "Nome demasiado longo") String name,
        @Size(max = 8, message = "Emoji demasiado longo") String emoji,
        @Size(max = 500, message = "URL de imagem demasiado longo") String image,
        @Size(max = 300, message = "Descrição demasiado longa") String description) {}
