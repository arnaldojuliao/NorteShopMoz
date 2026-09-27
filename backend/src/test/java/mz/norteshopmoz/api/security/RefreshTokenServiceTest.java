package mz.norteshopmoz.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import mz.norteshopmoz.api.config.AppProperties;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * Validação de refresh tokens com o Redis indisponível.
 *
 * <p>Antes devolvia {@code false}, o que transformava uma falha do Redis num
 * logout em massa (nenhuma sessão conseguia renovar). Agora falha aberto: o token
 * já foi verificado criptograficamente antes desta chamada e o Redis só serve
 * para detetar revogações — durante a indisponibilidade, aceitar um token
 * assinado válido é preferível a derrubar todas as sessões.</p>
 */
class RefreshTokenServiceTest {

    private static final String USER = "user-1";
    private static final String TOKEN = "refresh-token-abc";
    private static final String KEY = "nsm:auth:refresh:" + USER;

    private static final AppProperties PROPS = new AppProperties(
            new AppProperties.Jwt("segredo-de-teste-com-mais-de-32-caracteres", 3600, 7200),
            new AppProperties.Cors(List.of("http://localhost:3000")),
            null, null, null);

    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);

    @SuppressWarnings("unchecked")
    private final SetOperations<String, String> sets = mock(SetOperations.class);

    private final RefreshTokenService service = new RefreshTokenService(redis, PROPS);

    private void stubSetOps() {
        when(redis.opsForSet()).thenReturn(sets);
    }

    @Test
    void tokenGuardadoEhValido() {
        stubSetOps();
        when(sets.isMember(KEY, TOKEN)).thenReturn(true);

        assertThat(service.isValid(USER, TOKEN)).isTrue();
    }

    @Test
    void tokenRevogadoNaoEhValido() {
        stubSetOps();
        when(sets.isMember(KEY, TOKEN)).thenReturn(false);

        assertThat(service.isValid(USER, TOKEN)).isFalse();
    }

    @Test
    void redisIndisponivelFalhaAberto() {
        when(redis.opsForSet()).thenThrow(new RuntimeException("connection refused"));

        assertThat(service.isValid(USER, TOKEN))
                .as("uma falha do Redis não pode expulsar todas as sessões da loja")
                .isTrue();
    }

    @Test
    void storeNaoLancaQuandoORedisFalha() {
        when(redis.opsForSet()).thenThrow(new RuntimeException("connection refused"));

        // Não deve propagar: o login continua a funcionar (fail-open).
        service.store(USER, TOKEN);
        service.rotate(USER, "antigo", TOKEN);
        service.revokeAll(USER);
    }
}
