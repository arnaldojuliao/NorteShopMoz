package mz.norteshopmoz.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import java.util.List;
import java.util.Optional;
import mz.norteshopmoz.api.security.ClientIpResolver;
import mz.norteshopmoz.api.security.JwtService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * Buckets do rate limit: auth (credenciais), api (por conta autenticada),
 * anon-api (anónimo, IP generoso) e safe (leituras externas).
 *
 * <p>O ponto central destes testes é garantir que utilizadores autenticados
 * <strong>não</strong> partilham o bucket uns dos outros nem o bucket de um IP
 * público partilhado (CGNAT).</p>
 */
class RateLimitFilterTest {

    private RateLimiter limiter;
    private JwtCookieService jwtCookieService;
    private JwtService jwtService;
    private RateLimitFilter filter;
    private MockHttpServletResponse response;
    private FilterChain chain;

    @BeforeEach
    void setUp() {
        limiter = mock(RateLimiter.class);
        jwtCookieService = mock(JwtCookieService.class);
        jwtService = mock(JwtService.class);
        filter = new RateLimitFilter(limiter, jwtCookieService, jwtService);
        response = new MockHttpServletResponse();
        chain = mock(FilterChain.class);
        when(limiter.tryAcquire(anyString(), anyString()))
                .thenReturn(RateLimiter.RateLimitResult.allowed(1, 300, 60));
        // Por omissão não há sessão.
        when(jwtCookieService.getAccessToken(any())).thenReturn(Optional.empty());
        // Um proxy fidedigno para poder simular um cliente externo (IP público).
        ClientIpResolver.configure(List.of("10.0.0.1"), "");
    }

    @AfterEach
    void reset() {
        ClientIpResolver.configure(List.of(), "");
    }

    private MockHttpServletRequest request(String method, String path, String remoteAddr, String forwardedFor) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setRequestURI(path);
        request.setRemoteAddr(remoteAddr);
        if (forwardedFor != null) {
            request.addHeader("X-Forwarded-For", forwardedFor);
        }
        return request;
    }

    /** Simula um access token válido da conta {@code userId} no pedido. */
    private void authenticate(MockHttpServletRequest request, String userId) {
        when(jwtCookieService.getAccessToken(request)).thenReturn(Optional.of("token-" + userId));
        Claims claims = mock(Claims.class);
        when(claims.get("typ", String.class)).thenReturn("access");
        when(claims.get("uid", String.class)).thenReturn(userId);
        when(jwtService.parseClaims("token-" + userId)).thenReturn(claims);
    }

    private void run(MockHttpServletRequest request) throws Exception {
        filter.doFilter(request, response, chain);
    }

    @Test
    void leituraDeClienteExternoUsaBucketSafe() throws Exception {
        run(request("GET", "/api/products", "10.0.0.1", "8.8.8.8"));

        verify(limiter).tryAcquire("safe:8.8.8.8", "safe");
        verify(chain).doFilter(any(), any());
    }

    @Test
    void leituraDeServicoInternoNaoEhLimitada() throws Exception {
        // IP privado = serviço interno (o frontend que faz SSR partilha um IP).
        run(request("GET", "/api/products", "172.17.0.5", null));

        verifyNoInteractions(limiter);
    }

    @Test
    void imagensEFicheirosNaoSaoLimitados() throws Exception {
        run(request("GET", "/uploads/foto.png", "10.0.0.1", "8.8.8.8"));

        verifyNoInteractions(limiter);
    }

    @Test
    void postEmEndpointDeCredenciaisUsaBucketEstrito() throws Exception {
        run(request("POST", "/api/auth/login", "10.0.0.1", "8.8.8.8"));

        verify(limiter).tryAcquire("auth:8.8.8.8:/api/auth/login", "auth");
    }

    @Test
    void postAnonimoDeEstadoUsaBucketGenerosoPorIp() throws Exception {
        // Checkout de convidado, por exemplo: sem sessão, o limite é por IP mas
        // num bucket próprio e folgado (CGNAT).
        run(request("POST", "/api/orders", "10.0.0.1", "8.8.8.8"));

        verify(limiter).tryAcquire("anon-api:ip:8.8.8.8", "anon-api");
    }

    @Test
    void postAutenticadoEhChaveadoPorContaENaoPorIp() throws Exception {
        MockHttpServletRequest request = request("POST", "/api/orders", "10.0.0.1", "8.8.8.8");
        authenticate(request, "cliente-1");

        run(request);

        verify(limiter).tryAcquire("api:u:cliente-1", "api");
    }

    @Test
    void doisClientesNoMesmoIpNaoPartilhamBucket() throws Exception {
        // Cenário CGNAT: dois clientes atrás do mesmo IP público.
        MockHttpServletRequest a = request("POST", "/api/cart", "10.0.0.1", "8.8.8.8");
        authenticate(a, "cliente-a");
        MockHttpServletRequest b = request("POST", "/api/cart", "10.0.0.1", "8.8.8.8");
        authenticate(b, "cliente-b");

        run(a);
        run(b);

        verify(limiter).tryAcquire("api:u:cliente-a", "api");
        verify(limiter).tryAcquire("api:u:cliente-b", "api");
    }

    @Test
    void tokenInvalidoCaiNoBucketAnonimo() throws Exception {
        MockHttpServletRequest request = request("POST", "/api/orders", "10.0.0.1", "8.8.8.8");
        when(jwtCookieService.getAccessToken(request)).thenReturn(Optional.of("lixo"));
        when(jwtService.parseClaims("lixo")).thenThrow(new io.jsonwebtoken.JwtException("inválido"));

        run(request);

        verify(limiter).tryAcquire("anon-api:ip:8.8.8.8", "anon-api");
    }

    @Test
    void refreshTokenNaoContaComoSessao() throws Exception {
        // Um refresh token apresentado como access token não deve dar bucket por
        // conta (era um bypass do limite) — a verificação da claim "typ" impede-o.
        MockHttpServletRequest request = request("POST", "/api/orders", "10.0.0.1", "8.8.8.8");
        when(jwtCookieService.getAccessToken(request)).thenReturn(Optional.of("refresh"));
        Claims claims = mock(Claims.class);
        when(claims.get("typ", String.class)).thenReturn("refresh");
        when(jwtService.parseClaims("refresh")).thenReturn(claims);

        run(request);

        verify(limiter).tryAcquire("anon-api:ip:8.8.8.8", "anon-api");
    }

    @Test
    void responde429ComRetryAfterQuandoBloqueado() throws Exception {
        when(limiter.tryAcquire(anyString(), anyString()))
                .thenReturn(RateLimiter.RateLimitResult.limited(100, 100, 42));

        run(request("POST", "/api/orders", "10.0.0.1", "8.8.8.8"));

        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(response.getHeader("Retry-After")).isEqualTo("42");
        verify(chain, never()).doFilter(any(), any());
    }
}
