package mz.norteshopmoz.api.service;

import java.math.BigDecimal;

/**
 * Filtros/ordenação do catálogo — espelha os parâmetros do contrato
 * GET /api/products. Como é um record, serve também de chave do cache Redis.
 */
public record ProductQuery(
        String category,
        String q,
        String sort,
        boolean featured,
        boolean bestseller,
        boolean isNew,
        boolean deal,
        BigDecimal minPrice,
        BigDecimal maxPrice,
        Integer limit) {

    public static ProductQuery empty() {
        return new ProductQuery(null, null, null, false, false, false, false, null, null, null);
    }
}
