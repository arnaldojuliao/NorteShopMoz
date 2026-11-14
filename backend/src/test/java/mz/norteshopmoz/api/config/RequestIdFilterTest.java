package mz.norteshopmoz.api.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestIdFilterTest {

    private final RequestIdFilter filter = new RequestIdFilter();

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void geraUmIdQuandoNaoVemNenhum() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/products");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        String id = response.getHeader(RequestIdFilter.HEADER);
        assertThat(id).isNotBlank();
        assertThat(id).matches("[0-9a-f-]{36}");
    }

    @Test
    void reaproveitaOIdDeQuemJaOTem() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/products");
        request.addHeader(RequestIdFilter.HEADER, "nginx-abc123");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getHeader(RequestIdFilter.HEADER)).isEqualTo("nginx-abc123");
    }

    @Test
    void porOIdNoMdcDuranteOPedidoERemoveNoFim() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/products");
        MockHttpServletResponse response = new MockHttpServletResponse();
        String[] during = new String[1];

        filter.doFilter(request, response, new MockFilterChain() {
            @Override
            public void doFilter(jakarta.servlet.ServletRequest req,
                                 jakarta.servlet.ServletResponse res) {
                during[0] = RequestIdFilter.currentRequestId();
            }
        });

        assertThat(during[0]).isEqualTo(response.getHeader(RequestIdFilter.HEADER));
        assertThat(RequestIdFilter.currentRequestId()).isNull();
    }

    @Test
    void descartaIdsComCaracteresPerigosos() throws Exception {
        // Quebra de linha = injeção de linhas falsas no log.
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/products");
        request.addHeader(RequestIdFilter.HEADER, "abc\nINJECTED ERROR");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        String id = response.getHeader(RequestIdFilter.HEADER);
        assertThat(id).doesNotContain("\n", "INJECTED");
        assertThat(id).matches("[0-9a-f-]{36}");
    }
}
