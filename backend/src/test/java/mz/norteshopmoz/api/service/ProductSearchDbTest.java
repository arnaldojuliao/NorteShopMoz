package mz.norteshopmoz.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import mz.norteshopmoz.api.domain.Product;
import mz.norteshopmoz.api.repository.ProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * Pesquisa do catálogo ({@code ?q=}) ao nível do repositório.
 *
 * <p>O que se está a fixar é o comportamento, não a implementação: maiúsculas,
 * minúsculas e acentos não podem mudar o resultado. Era esse o buraco — «cha»
 * não encontrava «Chá» porque a comparação era {@code lower(coluna) LIKE …},
 * que distingue acentos. Correr isto com o repositório em mock não provaria
 * nada: quem compara os textos é a base de dados.</p>
 *
 * <p>Transacional: os produtos de teste ficam revertidos e não contaminam o
 * catálogo semeado que os outros testes usam.</p>
 */
@SpringBootTest
@ActiveProfiles("unit-test")
@Transactional
class ProductSearchDbTest {

    @Autowired
    ProductRepository productRepository;

    private final String suffix = UUID.randomUUID().toString().substring(0, 8);

    @BeforeEach
    void seed() {
        productRepository.save(product("Chá Verde Especial", "MozTea", "Infusão de folhas selecionadas"));
        productRepository.save(product("Café de Maputo", "Gorongosa", "Grão torrado localmente"));
    }

    private Product product(String name, String brand, String shortDescription) {
        return Product.builder()
                .id(UUID.randomUUID().toString())
                .slug("teste-" + suffix + "-" + name.toLowerCase().replaceAll("[^a-z0-9]+", "-"))
                .name(name)
                .brand(brand)
                .category("bebidas")
                .price(new BigDecimal("250.00"))
                .rating(4.5)
                .ratingCount(3)
                .sold(0)
                .stock(10)
                .shortDescription(shortDescription)
                // O @Builder do Lombok ignora os inicializadores de campo: as
                // colunas JSON NOT NULL têm de ser passadas explicitamente.
                .images(List.of())
                .description(List.of())
                .specs(List.of())
                .badges(List.of())
                .deliveryDays(List.of(2, 4))
                .tags(List.of())
                .build();
    }

    private List<String> names(String term) {
        ProductQuery query = new ProductQuery(null, term, null, false, false, false, false, null, null, null);
        return productRepository.findAll(ProductSpecifications.from(query)).stream()
                .map(Product::getName)
                .toList();
    }

    @Test
    void encontraSemAcentoMesmoComAcentoNoNome() {
        assertThat(names("cha verde")).contains("Chá Verde Especial");
    }

    @Test
    void encontraComAcento() {
        assertThat(names("chá")).contains("Chá Verde Especial");
    }

    @Test
    void ignoraMaiusculas() {
        assertThat(names("CAFÉ")).contains("Café de Maputo");
    }

    @Test
    void pesquisaTambemNaMarcaEDescricaoCurta() {
        assertThat(names("moztea")).contains("Chá Verde Especial");
        assertThat(names("grão torrado")).contains("Café de Maputo");
    }

    @Test
    void termoSemCorrespondenciaNaoDevolveNada() {
        assertThat(names("xilofone")).isEmpty();
    }
}
