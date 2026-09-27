package mz.norteshopmoz.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Regras de confiança do IP do cliente.
 *
 * O caso central é o da vulnerabilidade corrigida: sem proxies fidedignos
 * configurados, um {@code X-Forwarded-For} inventado tem de ser ignorado — caso
 * contrário cada valor inventado cria um bucket de rate limit novo (bypass).
 */
class ClientIpResolverTest {

    @AfterEach
    void reset() {
        ClientIpResolver.configure(List.of(), "");
    }

    private MockHttpServletRequest request(String remoteAddr, String forwardedFor, String proxyToken) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remoteAddr);
        if (forwardedFor != null) {
            request.addHeader("X-Forwarded-For", forwardedFor);
        }
        if (proxyToken != null) {
            request.addHeader(ClientIpResolver.PROXY_TOKEN_HEADER, proxyToken);
        }
        return request;
    }

    @Test
    void ignoraHeaderForjadoQuandoNenhumProxyEhFidedigno() {
        assertThat(ClientIpResolver.resolve(request("203.0.113.9", "10.0.0.1", null)))
                .isEqualTo("203.0.113.9");
    }

    @Test
    void usaUltimoElementoDoXffQuandoOParEhProxyFidedigno() {
        ClientIpResolver.configure(List.of("10.1.1.1"), "");

        // Os elementos anteriores podem vir do cliente; só o último é do proxy.
        assertThat(ClientIpResolver.resolve(request("10.1.1.1", "1.2.3.4, 203.0.113.7", null)))
                .isEqualTo("203.0.113.7");
    }

    @Test
    void aceitaProxyDefinidoPorCidr() {
        ClientIpResolver.configure(List.of("10.2.0.0/16"), "");

        assertThat(ClientIpResolver.resolve(request("10.2.3.4", "203.0.113.7", null)))
                .isEqualTo("203.0.113.7");
    }

    @Test
    void cidrNaoCobreEnderecosForaDaRede() {
        ClientIpResolver.configure(List.of("10.2.0.0/16"), "");

        assertThat(ClientIpResolver.resolve(request("10.3.0.1", "203.0.113.7", null)))
                .isEqualTo("10.3.0.1");
    }

    @Test
    void reconheceProxyLoopbackIpv6PelaFormaCanonica() {
        ClientIpResolver.configure(List.of("::1"), "");

        // O Java entrega o IPv6 por extenso; a lista é escrita em forma curta.
        assertThat(ClientIpResolver.resolve(request("0:0:0:0:0:0:0:1", "203.0.113.7", null)))
                .isEqualTo("203.0.113.7");
    }

    @Test
    void aceitaProxyEscritoNaFormaExtensa() {
        ClientIpResolver.configure(List.of("0:0:0:0:0:0:0:1"), "");

        assertThat(ClientIpResolver.resolve(request("::1", "203.0.113.7", null)))
                .isEqualTo("203.0.113.7");
    }

    @Test
    void tokenDoProxyAutenticaMesmoComIpDesconhecido() {
        ClientIpResolver.configure(List.of(), "segredo-do-nginx");

        assertThat(ClientIpResolver.resolve(request("198.51.100.4", "203.0.113.7", "segredo-do-nginx")))
                .isEqualTo("203.0.113.7");
    }

    @Test
    void tokenErradoNaoDaConfianca() {
        ClientIpResolver.configure(List.of(), "segredo-do-nginx");

        assertThat(ClientIpResolver.resolve(request("198.51.100.4", "203.0.113.7", "outro")))
                .isEqualTo("198.51.100.4");
    }

    @Test
    void reconheceEnderecosPrivados() {
        assertThat(ClientIpResolver.isPrivate("172.17.0.5")).isTrue();
        assertThat(ClientIpResolver.isPrivate("10.0.0.1")).isTrue();
        assertThat(ClientIpResolver.isPrivate("127.0.0.1")).isTrue();
        assertThat(ClientIpResolver.isPrivate("8.8.8.8")).isFalse();
        assertThat(ClientIpResolver.isPrivate("203.0.113.7")).isFalse();
    }
}
