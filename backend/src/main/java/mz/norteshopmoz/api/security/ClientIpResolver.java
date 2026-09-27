package mz.norteshopmoz.api.security;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Resolve o IP do cliente quando a API está atrás de um proxy inverso (nginx).
 *
 * <p>Regras:
 * <ul>
 *   <li>Os cabeçalhos {@code X-Forwarded-For} / {@code X-Real-IP} só são
 *       considerados quando o pedido vem de um proxy <strong>explicitamente
 *       fidedigno</strong> (ver abaixo). Caso contrário qualquer cliente que
 *       alcance a API podia forjar o header e ficar com um bucket de rate limit
 *       por cada valor inventado — na prática, limites ilimitados.</li>
 *   <li>Do {@code X-Forwarded-For} usa-se o <strong>último</strong> elemento: os
 *       anteriores podem ter sido fornecidos pelo cliente e apenas o último é
 *       acrescentado pelo proxy. (O nginx do projeto também sobrescreve o header
 *       com {@code $remote_addr}.)</li>
 * </ul>
 *
 * <p>Como se marca um proxy como fidedigno ({@code app.security.*}, ver
 * {@link mz.norteshopmoz.api.config.ProxyTrustConfig}):
 * <ul>
 *   <li>{@code trusted-proxies} — lista de IPs/CIDRs (ex.: {@code 172.20.0.10}
 *       ou {@code 172.20.0.0/16});</li>
 *   <li>{@code proxy-token} — valor de {@code X-Proxy-Token} que só o proxy
 *       conhece (útil quando o IP do proxy não é fixo, ex.: Docker).</li>
 * </ul>
 * Sem nenhum dos dois configurados, <strong>nada</strong> é considerado
 * fidedigno e usa-se sempre o IP real da ligação — que é o mais seguro e o
 * comportamento por omissão.
 */
public final class ClientIpResolver {

    /** Cabeçalho com o segredo partilhado do proxy inverso. */
    public static final String PROXY_TOKEN_HEADER = "X-Proxy-Token";

    private static final List<String> TRUSTED_PROXIES = new CopyOnWriteArrayList<>();
    private static volatile String proxyToken = "";

    private ClientIpResolver() {
    }

    /**
     * Define os proxies fidedignos (chamado uma vez no arranque por
     * {@link mz.norteshopmoz.api.config.ProxyTrustConfig}). Entradas vazias
     * limpam a lista — nenhum proxy é fidedigno.
     */
    public static void configure(List<String> trustedProxies, String token) {
        TRUSTED_PROXIES.clear();
        if (trustedProxies != null) {
            trustedProxies.stream()
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .forEach(TRUSTED_PROXIES::add);
        }
        proxyToken = token == null ? "" : token.trim();
    }

    /** IP do cliente a usar como chave de rate limit / lockout / auditoria. */
    public static String resolve(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        if (!isTrustedProxy(request, remoteAddr)) {
            return remoteAddr;
        }
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            String[] parts = xff.split(",");
            for (int i = parts.length - 1; i >= 0; i--) {
                String candidate = parts[i].trim();
                if (!candidate.isEmpty()) {
                    return candidate;
                }
            }
        }
        String xri = request.getHeader("X-Real-IP");
        if (xri != null && !xri.isBlank()) {
            return xri.trim();
        }
        return remoteAddr;
    }

    /**
     * O pedido vem de um proxy fidedigno? Verdadeiro quando o IP da ligação
     * direta consta da lista configurada <em>ou</em> quando o pedido traz o
     * token do proxy (comparação em tempo constante).
     */
    public static boolean isTrustedProxy(HttpServletRequest request, String remoteAddr) {
        String configured = proxyToken;
        if (!configured.isEmpty()) {
            String sent = request.getHeader(PROXY_TOKEN_HEADER);
            if (sent != null && MessageDigestSupport.constantTimeEquals(configured, sent.trim())) {
                return true;
            }
        }
        return isTrustedProxy(remoteAddr);
    }

    /** Verdadeiro se o endereço consta da lista de proxies fidedignos. */
    public static boolean isTrustedProxy(String remoteAddr) {
        if (remoteAddr == null || remoteAddr.isBlank()) {
            return false;
        }
        for (String entry : TRUSTED_PROXIES) {
            boolean matched = entry.indexOf('/') >= 0
                    ? matchesCidr(remoteAddr, entry)
                    : sameAddress(remoteAddr, entry);
            if (matched) {
                return true;
            }
        }
        return false;
    }

    /**
     * Compara dois endereços IP pela forma canónica (o Java escreve o IPv6 por
     * extenso — {@code ::1} chega como {@code 0:0:0:0:0:0:0:1}), pelo que uma
     * comparação de texto falharia em loopback/aliases IPv6.
     */
    private static boolean sameAddress(String a, String b) {
        try {
            return java.util.Arrays.equals(
                    InetAddress.getByName(a).getAddress(),
                    InetAddress.getByName(b).getAddress());
        } catch (UnknownHostException e) {
            return a.equalsIgnoreCase(b);
        }
    }

    /**
     * Verdadeiro para loopback ou endereço privado/link-local — usado para
     * isentar serviços internos (o servidor do frontend que faz SSR) dos limites
     * pensados para tráfego de utilizadores.
     */
    public static boolean isPrivate(String ip) {
        if (ip == null || ip.isBlank()) {
            return false;
        }
        try {
            InetAddress addr = InetAddress.getByName(ip);
            return addr.isLoopbackAddress() || addr.isSiteLocalAddress() || addr.isLinkLocalAddress();
        } catch (UnknownHostException e) {
            return false;
        }
    }

    /** Compara um IP com uma entrada {@code a.b.c.d/prefixo}. */
    private static boolean matchesCidr(String ip, String cidr) {
        int slash = cidr.indexOf('/');
        if (slash <= 0) {
            return false;
        }
        try {
            byte[] addr = InetAddress.getByName(ip).getAddress();
            byte[] network = InetAddress.getByName(cidr.substring(0, slash)).getAddress();
            int prefix = Integer.parseInt(cidr.substring(slash + 1).trim());
            if (addr.length != network.length || prefix < 0 || prefix > addr.length * 8) {
                return false;
            }
            for (int i = 0; i < addr.length; i++) {
                int bits = prefix - i * 8;
                if (bits <= 0) {
                    return true;
                }
                int mask = bits >= 8 ? 0xFF : (0xFF << (8 - bits)) & 0xFF;
                if ((addr[i] & mask) != (network[i] & mask)) {
                    return false;
                }
            }
            return true;
        } catch (UnknownHostException | NumberFormatException e) {
            return false;
        }
    }

    /** Comparação de segredos resistente a timing attacks. */
    private static final class MessageDigestSupport {
        static boolean constantTimeEquals(String a, String b) {
            return java.security.MessageDigest.isEqual(
                    a.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                    b.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
    }
}
