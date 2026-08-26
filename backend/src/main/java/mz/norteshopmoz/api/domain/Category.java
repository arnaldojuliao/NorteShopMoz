package mz.norteshopmoz.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Categoria de produtos (contrato do frontend: slug, name, emoji, image, description). */
@Entity
@Table(name = "categories")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Category {

    @Id
    @Column(length = 60)
    private String slug;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(length = 8)
    private String emoji;

    @Column(length = 500)
    private String image;

    @Column(length = 300)
    private String description;
}
