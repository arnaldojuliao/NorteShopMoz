package mz.norteshopmoz.api.config;

import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import mz.norteshopmoz.api.security.ClientIpResolver;

/**
 * Configura os proxies inversos fidedignos para o {@link ClientIpResolver}.
 *
 * <p>Sem configuração, nenhum proxy é fidedigno e os cabeçalhos
 * {@code X-Forwarded-For}/{@code X-Real-IP} são ignorados (usa-se o IP real da
 * ligação). Isto evita que um cliente que alcance a API forje o header e fique
 * com um bucket de rate limit novo por cada valor inventado.
 *
 * <p>Em produção atrás do nginx (Docker) defina uma das opções:
 * <pre>
 *   TRUSTED_PROXIES=172.20.0.10            # IP do proxy
 *   TRUSTED_PROXIES=172.20.0.0/16          # sub-rede do proxy
 *   PROXY_TOKEN=...                        # segredo que o proxy envia em X-Proxy-Token
 * </pre>
 */
@Configuration
public class ProxyTrustConfig {

    public ProxyTrustConfig(
            @Value("${app.security.trusted-proxies:}") String trustedProxies,
            @Value("${app.security.proxy-token:}") String proxyToken) {
        ClientIpResolver.configure(parse(trustedProxies), proxyToken);
    }

    private static List<String> parse(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        return Arrays.stream(value.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }
}
