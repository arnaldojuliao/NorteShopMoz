package mz.norteshopmoz.api.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Produto — espelha exatamente o contrato TypeScript do frontend.
 * As coleções (images, description, specs, badges, variants, deliveryDays, tags)
 * são guardadas em colunas JSONB e devolvidas como arrays no JSON.
 */
@Entity
@Table(name = "products")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Product {

    @Id
    @Column(length = 40)
    private String id;

    @Column(nullable = false, unique = true, length = 120)
    private String slug;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(length = 60)
    private String brand;

    /** Slug da categoria (o frontend apenas consome o slug). */
    @Column(nullable = false, length = 60)
    private String category;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal price;

    @Column(precision = 12, scale = 2)
    private BigDecimal oldPrice;

    @Column(nullable = false)
    private double rating;

    @Column(nullable = false)
    private int ratingCount;

    @Column(nullable = false)
    private int sold;

    @Column(nullable = false)
    private int stock;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private List<String> images = new ArrayList<>();

    @Column(nullable = false, length = 300)
    private String shortDescription;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private List<String> description = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private List<ProductSpec> specs = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private List<String> badges = new ArrayList<>();

    private boolean featured;
    private boolean bestseller;

    /** Atenção: o nome do campo é "isNew" (contrato TS) — forçado via @JsonProperty. */
    @JsonProperty("isNew")
    private boolean isNew;

    private boolean dealOfDay;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private List<ProductVariant> variants = new ArrayList<>();

    /** [min, max] dias úteis de entrega (contrato: array de 2 números). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private List<Integer> deliveryDays = new ArrayList<>();

    private boolean freeShipping;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private List<String> tags = new ArrayList<>();
}
