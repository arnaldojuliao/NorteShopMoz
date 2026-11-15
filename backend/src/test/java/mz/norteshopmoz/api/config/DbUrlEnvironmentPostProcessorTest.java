package mz.norteshopmoz.api.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;

class DbUrlEnvironmentPostProcessorTest {

    /** Emula os placeholders de application-prod.yml (o MockEnvironment não tem ficheiros YAML). */
    private static void emularApplicationProd(MockEnvironment env) {
        env.setProperty("spring.datasource.url", "${DB_URL:${DATABASE_URL:jdbc:postgresql://localhost:5434/norteshopmoz}}");
        env.setProperty("spring.datasource.username", "${DB_USER:}");
        env.setProperty("spring.datasource.password", "${DB_PASSWORD:}");
        env.setProperty("spring.flyway.url", "${FLYWAY_URL:${DB_URL:${DATABASE_URL}}}");
    }

    @Test
    void converteUriDoSupabaseParaJdbc() {
        MockEnvironment env = new MockEnvironment()
                .withProperty("DATABASE_URL",
                        "postgresql://postgres.abc123:se%2Cret%40pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require");
        emularApplicationProd(env);

        new DbUrlEnvironmentPostProcessor().postProcessEnvironment(env, null);

        assertThat(env.getProperty("spring.datasource.url"))
                .isEqualTo("jdbc:postgresql://aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require");
        assertThat(env.getProperty("spring.datasource.username")).isEqualTo("postgres.abc123");
        assertThat(env.getProperty("spring.datasource.password")).isEqualTo("se,ret@pass");
        // A senha não está definida, por isso o Flyway herda a da URI.
        assertThat(env.getProperty("spring.flyway.url"))
                .isEqualTo("jdbc:postgresql://aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require");
        assertThat(env.getProperty("spring.flyway.user")).isEqualTo("postgres.abc123");
        assertThat(env.getProperty("spring.flyway.password")).isEqualTo("se,ret@pass");
    }

    @Test
    void aceitaEsquemaPostgresSemPrefixoJdbc() {
        MockEnvironment env = new MockEnvironment()
                .withProperty("DB_URL", "postgres://postgres.abc:s3cr3t@host.up.starafrica.supabase.com:5432/postgres");
        emularApplicationProd(env);

        new DbUrlEnvironmentPostProcessor().postProcessEnvironment(env, null);

        assertThat(env.getProperty("spring.datasource.url"))
                .isEqualTo("jdbc:postgresql://host.up.starafrica.supabase.com:5432/postgres");
        assertThat(env.getProperty("spring.datasource.username")).isEqualTo("postgres.abc");
        assertThat(env.getProperty("spring.datasource.password")).isEqualTo("s3cr3t");
    }

    @Test
    void jdbcExplícitoNaoÉAlterado() {
        MockEnvironment env = new MockEnvironment()
                .withProperty("DB_URL", "jdbc:postgresql://localhost:5434/norteshopmoz")
                .withProperty("DATABASE_URL", "postgresql://postgres:x@host:5432/db");
        emularApplicationProd(env);

        new DbUrlEnvironmentPostProcessor().postProcessEnvironment(env, null);

        assertThat(env.getProperty("spring.datasource.url"))
                .isEqualTo("jdbc:postgresql://localhost:5434/norteshopmoz");
        assertThat(env.getProperty("spring.datasource.username")).isEmpty();
        assertThat(env.getProperty("spring.flyway.url"))
                .isEqualTo("jdbc:postgresql://localhost:5434/norteshopmoz");
    }

    @Test
    void utilizadorExplícitoTemPrioridadeSobreAUri() {
        MockEnvironment env = new MockEnvironment()
                .withProperty("DATABASE_URL", "postgresql://postgres.abc:pass@host:5432/postgres")
                .withProperty("DB_USER", "postgres.xyz");
        emularApplicationProd(env);

        new DbUrlEnvironmentPostProcessor().postProcessEnvironment(env, null);

        assertThat(env.getProperty("spring.datasource.username")).isEqualTo("postgres.xyz");
        assertThat(env.getProperty("spring.datasource.password")).isEqualTo("pass");
    }

    @Test
    void portaPorOmissaoE5432() {
        MockEnvironment env = new MockEnvironment()
                .withProperty("DATABASE_URL", "postgresql://u:p@host/postgres");
        emularApplicationProd(env);

        new DbUrlEnvironmentPostProcessor().postProcessEnvironment(env, null);

        assertThat(env.getProperty("spring.datasource.url"))
                .isEqualTo("jdbc:postgresql://host:5432/postgres");
    }
}
