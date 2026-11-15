package mz.norteshopmoz.api.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Aceita a URI <code>postgresql://</code> (ou <code>postgres://</code>) copiada
 * do painel do Supabase e converte-a para o formato JDBC
 * (<code>jdbc:postgresql://...</code>) que o Hikari e o Flyway exigem.
 *
 * <p>Corre via META-INF/spring.factories antes do contexto arrancar. Quando a
 * conversão acontece, a propriedade convertida é adicionada com a maior
 * precedência, por isso os placeholders de application-prod.yml
 * (<code>${DB_URL:...}</code>) nem chegam a ser avaliados — a app arranca com a
 * URL correta. O utilizador pode simplesmente colar a URI do painel.</p>
 *
 * <p>Quando DB_USER/DB_PASSWORD (ou FLYWAY_USER/FLYWAY_PASSWORD) não estão
 * definidos, o utilizador/password são extraídos do userinfo da URI. Se as
 * variáveis separadas estiverem definidas, elas ganham (a URI pode ter
 * credenciais desatualizadas).</p>
 */
public class DbUrlEnvironmentPostProcessor implements EnvironmentPostProcessor {

    /** %XX percent-encoded (não decodifica '+', que é válido em passwords). */
    private static final Pattern PERCENT_ESCAPES = Pattern.compile("%([0-9A-Fa-f]{2})");

    private static final String SOURCE_NAME = "nsm-db-url-normalizer";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        Map<String, Object> props = new LinkedHashMap<>();
        convert(environment, props, "spring.datasource.url", "spring.datasource.username",
                "spring.datasource.password", "DB_USER", "DB_PASSWORD");
        convert(environment, props, "spring.flyway.url", "spring.flyway.user",
                "spring.flyway.password", "FLYWAY_USER", "FLYWAY_PASSWORD");
        if (!props.isEmpty()) {
            environment.getPropertySources().addFirst(new MapPropertySource(SOURCE_NAME, props));
        }
    }

    private void convert(ConfigurableEnvironment env, Map<String, Object> props, String urlKey,
                         String userKey, String passwordKey, String explicitUser, String explicitPassword) {
        String raw = env.getProperty(urlKey);
        if (raw == null || raw.startsWith("jdbc:")) {
            return;
        }
        if (!raw.startsWith("postgres://") && !raw.startsWith("postgresql://")) {
            return;
        }

        URI uri;
        try {
            uri = new URI(raw);
        } catch (URISyntaxException e) {
            throw new IllegalStateException(urlKey + ": a URI " + raw + " não é válida: " + e.getMessage(), e);
        }

        StringBuilder jdbc = new StringBuilder("jdbc:postgresql://");
        String host = uri.getHost();
        if (host == null) {
            throw new IllegalStateException(urlKey + ": a URI " + raw + " não tem host.");
        }
        if (host.contains(":")) {
            jdbc.append('[').append(host).append(']'); // host IPv6 literal
        } else {
            jdbc.append(host);
        }
        jdbc.append(':').append(uri.getPort() > 0 ? uri.getPort() : 5432);
        if (uri.getPath() != null && !uri.getPath().isBlank()) {
            jdbc.append(uri.getPath()); // "/postgres"
        }
        if (uri.getRawQuery() != null && !uri.getRawQuery().isBlank()) {
            jdbc.append('?').append(uri.getRawQuery());
        }
        props.put(urlKey, jdbc.toString());

        String userInfo = uri.getUserInfo();
        if (userInfo != null && !userInfo.isBlank()) {
            String[] parts = userInfo.split(":", 2);
            String user = percentDecode(parts[0]);
            String password = parts.length > 1 ? percentDecode(parts[1]) : "";
            if (isBlank(env.getProperty(explicitUser))) {
                props.put(userKey, user);
            }
            if (isBlank(env.getProperty(explicitPassword))) {
                props.put(passwordKey, password);
            }
        }
    }

    /** Decodifica apenas sequências %XX (o '+' é um carácter literal de password). */
    private String percentDecode(String value) {
        Matcher matcher = PERCENT_ESCAPES.matcher(value);
        StringBuilder decoded = new StringBuilder();
        while (matcher.find()) {
            matcher.appendReplacement(decoded, Matcher.quoteReplacement(
                    String.valueOf((char) Integer.parseInt(matcher.group(1), 16))));
        }
        matcher.appendTail(decoded);
        return decoded.toString();
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
