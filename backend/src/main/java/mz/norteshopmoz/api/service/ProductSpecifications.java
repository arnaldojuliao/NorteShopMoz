package mz.norteshopmoz.api.service;

import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import java.util.ArrayList;
import java.util.List;
import mz.norteshopmoz.api.domain.Product;
import org.springframework.data.jpa.domain.Specification;

/** Constrói predicados JPA a partir do ProductQuery (filtros do catálogo). */
public final class ProductSpecifications {

    private ProductSpecifications() {}

    public static Specification<Product> from(ProductQuery query) {
        return (root, cq, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (query.category() != null && !query.category().isBlank()) {
                predicates.add(cb.equal(root.get("category"), query.category()));
            }

            if (query.q() != null && !query.q().isBlank()) {
                // Nota: tags é uma coluna JSONB — não é indexável com LIKE.
                // A pesquisa cobre nome, marca e descrição curta.
                //
                // A expressão é `nsm_normalize(coluna)` — minúsculas + sem
                // acentos — e não `lower(coluna)`: é exatamente a expressão dos
                // índices GIN trigram criados na V13, e é o que faz o LIKE com
                // `%` à esquerda usar índice em vez de varrer a tabela. Também
                // faz «cha» encontrar «Chá». O termo passa pela mesma função
                // (constante por execução) para as duas pontas normalizarem
                // de forma idêntica.
                Expression<String> like = normalize(cb, cb.literal("%" + query.q().trim() + "%"));
                predicates.add(cb.or(
                        cb.like(normalize(cb, root.get("name")), like),
                        cb.like(normalize(cb, root.get("brand")), like),
                        cb.like(normalize(cb, root.get("shortDescription")), like)));
            }

            if (query.featured()) {
                predicates.add(cb.isTrue(root.get("featured")));
            }
            if (query.bestseller()) {
                predicates.add(cb.isTrue(root.get("bestseller")));
            }
            if (query.isNew()) {
                predicates.add(cb.isTrue(root.get("isNew")));
            }
            if (query.deal()) {
                predicates.add(cb.isTrue(root.get("dealOfDay")));
            }
            if (query.minPrice() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("price"), query.minPrice()));
            }
            if (query.maxPrice() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("price"), query.maxPrice()));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /**
     * {@code nsm_normalize(expr)} — a função IMMUTABLE criada na V13 (lower +
     * unaccent). Tem de ser chamada desta forma para casar com o índice GIN.
     */
    private static Expression<String> normalize(CriteriaBuilder cb, Expression<?> expr) {
        return cb.function("nsm_normalize", String.class, expr);
    }
}
