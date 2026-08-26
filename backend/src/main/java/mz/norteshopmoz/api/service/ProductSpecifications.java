package mz.norteshopmoz.api.service;

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
                String like = "%" + query.q().trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("brand"), "")), like),
                        cb.like(cb.lower(root.get("shortDescription")), like)));
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
}
