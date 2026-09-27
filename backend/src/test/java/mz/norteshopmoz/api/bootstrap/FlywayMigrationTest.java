package mz.norteshopmoz.api.bootstrap;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import mz.norteshopmoz.api.repository.ProductRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Verifica as migrações Flyway na configuração real — PostgreSQL, schema vazio,
 * `ddl-auto=validate` — e não no H2 dos testes unitários (onde o Flyway está
 * desativado e o schema é gerado pelas entidades).
 *
 * <p>É o teste que apanha aquilo que os testes unitários não vêem: SQL de
 * migração inválido, colunas em falta face às entidades, ou um baseline que faria
 * saltar a migração inicial. Corre só quando há Docker disponível
 * ({@code disabledWithoutDocker}); em ambientes sem Docker é ignorado em vez de
 * falhar.</p>
 */
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest
class FlywayMigrationTest {

    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("norteshopmoz_migration")
            .withUsername("test")
            .withPassword("test");

    @Container
    static final GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine")
            .withExposedPorts(6379);

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.data.redis.host", redis::getHost);
        registry.add("spring.data.redis.port", redis::getFirstMappedPort);
        // Comportamento de produção: o schema vem das migrações e o Hibernate
        // só valida (nunca cria/alterar).
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }

    @Autowired
    DataSource dataSource;

    @Autowired
    ProductRepository productRepository;

    @Test
    void aplicaMigracoesEmSchemaVazioEValidaComAsEntidades() throws Exception {
        try (Connection conn = dataSource.getConnection()) {
            // Histórico do Flyway: schema vazio → a V1 é aplicada diretamente,
            // SEM linha de baseline (version 0). Se aparecesse um baseline, a
            // migração inicial tinha sido saltada e o schema viria vazio.
            // A base do projeto já incluiu V4, V5, V6 e V7; o teste tem de validar
            // o conjunto completo de migrações, não apenas as 3 iniciais.
            List<String> applied = new ArrayList<>();
            boolean allSucceeded = true;
            try (PreparedStatement ps = conn.prepareStatement(
                    "select version, success from flyway_schema_history order by installed_rank");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    applied.add(rs.getString("version"));
                    allSucceeded &= rs.getBoolean("success");
                }
            }
            assertThat(applied)
                    .as("num schema vazio o Flyway aplica todas as migrações, sem baseline")
                    .containsExactly("1", "2", "3", "4", "5", "6", "7");
            assertThat(allSucceeded).isTrue();
            assertThat(applied).doesNotContain("0");

            // As tabelas centrais existem depois da migração.
            assertThat(tableExists(conn, "products")).isTrue();
            assertThat(tableExists(conn, "orders")).isTrue();
            assertThat(tableExists(conn, "order_items")).isTrue();
            assertThat(tableExists(conn, "users")).isTrue();
            assertThat(tableExists(conn, "coupons")).isTrue();

            // As chaves estrangeiras da V1 foram criadas.
            assertThat(foreignKeyOn(conn, "order_items", "order_id")).isTrue();
            assertThat(foreignKeyOn(conn, "reviews", "product_id")).isTrue();

            // A V2 acrescentou o carimbo que permite expurgar carrinhos de
            // convidado (a coluna faz parte do mapeamento das entidades, pelo
            // que ddl-auto=validate também depende dela).
            assertThat(columnExists(conn, "user_carts", "updated_at")).isTrue();

            // A V3 acrescentou os índices que suportam as agregações do painel.
            assertThat(indexExists(conn, "idx_orders_status")).isTrue();
            assertThat(indexExists(conn, "idx_orders_date")).isTrue();
            assertThat(indexExists(conn, "idx_order_items_product_id")).isTrue();

            // V4-V7 adicionaram os índices de lookup do utilizador e a tabela do
            // ShedLock — o estado de evolução do schema deve manter-se consistente.
            assertThat(indexExists(conn, "idx_orders_user_id")).isTrue();
            assertThat(indexExists(conn, "idx_users_reset_token")).isTrue();
            assertThat(indexExists(conn, "idx_users_verification_token")).isTrue();
            assertThat(tableExists(conn, "shedlock")).isTrue();
        }

        // O contexto arrancou com ddl-auto=validate (senão o teste nem corria) e
        // o DataSeeder semeou o catálogo sobre o schema migrado.
        assertThat(productRepository.count()).isGreaterThan(0);
    }

    private static boolean tableExists(Connection conn, String table) throws Exception {
        try (PreparedStatement ps = conn.prepareStatement(
                "select 1 from information_schema.tables where table_schema = 'public' and table_name = ?")) {
            ps.setString(1, table);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    private static boolean indexExists(Connection conn, String index) throws Exception {
        try (PreparedStatement ps = conn.prepareStatement(
                "select 1 from pg_indexes where schemaname = 'public' and indexname = ?")) {
            ps.setString(1, index);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    private static boolean columnExists(Connection conn, String table, String column) throws Exception {
        try (PreparedStatement ps = conn.prepareStatement(
                "select 1 from information_schema.columns where table_schema = 'public' and table_name = ? and column_name = ?")) {
            ps.setString(1, table);
            ps.setString(2, column);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    private static boolean foreignKeyOn(Connection conn, String table, String column) throws Exception {
        try (PreparedStatement ps = conn.prepareStatement(
                "select 1 from pg_constraint c "
                        + "join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey) "
                        + "where c.conrelid = ?::regclass and c.contype = 'f' and a.attname = ?")) {
            ps.setString(1, table);
            ps.setString(2, column);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }
}
