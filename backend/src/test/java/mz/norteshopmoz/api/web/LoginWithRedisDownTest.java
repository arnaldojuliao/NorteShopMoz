package mz.norteshopmoz.api.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.time.Duration;
import java.util.UUID;
import mz.norteshopmoz.api.domain.UserAccount;
import mz.norteshopmoz.api.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Redis em baixo <strong>não pode derrubar o login</strong>.
 *
 * <p>O login toca no Redis em vários pontos, todos eles estado auxiliar: o
 * bloqueio por brute-force ({@code LoginAttemptService}), os refresh tokens
 * ({@code RefreshTokenService}), a inatividade da sessão
 * ({@code SessionIdleService}), a revogação de tokens
 * ({@code SessionRevocationService}) e o rate limit ({@code RateLimiter}). Cada
 * um deles falha aberto individualmente (ver os testes de cada serviço), mas nada
 * garantia que o <em>conjunto</em> não partisse: uma excepção que escapasse de
 * qualquer um destes caminhos dava 500 em cada tentativa de login e a loja ficava
 * sem ninguém a conseguir entrar.</p>
 *
 * <p>Aqui o {@code StringRedisTemplate} é substituído por um mock que lança
 * {@link RedisConnectionFailureException} em todas as operações — o mesmo que
 * acontece com o contentor {@code redis} em baixo — e verifica-se que o login
 * continua a funcionar, com cookies de sessão, e que um pedido autenticado
 * subsequente também passa.</p>
 */
@SpringBootTest
@ActiveProfiles("unit-test")
@AutoConfigureMockMvc
class LoginWithRedisDownTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    UserRepository userRepository;

    @Autowired
    PasswordEncoder passwordEncoder;

    /** Toda a API de Redis a lançar — o equivalente a um Redis inalcançável. */
    @MockitoBean
    StringRedisTemplate redis;

    @BeforeEach
    void redisIndisponivel() {
        RedisConnectionFailureException down = new RedisConnectionFailureException("Redis indisponível");
        when(redis.opsForValue()).thenThrow(down);
        when(redis.opsForSet()).thenThrow(down);
        when(redis.hasKey(anyString())).thenThrow(down);
        when(redis.delete(anyString())).thenThrow(down);
        when(redis.expire(anyString(), any(Duration.class))).thenThrow(down);
        when(redis.getExpire(anyString(), any())).thenThrow(down);
    }

    /** Conta real na base de dados (o login valida a password a sério). */
    private UserAccount createUser(String email, String password) {
        return userRepository.save(UserAccount.builder()
                .email(email)
                .fullName("Cliente Redis")
                .passwordHash(passwordEncoder.encode(password))
                .role("CUSTOMER")
                .authProvider("EMAIL")
                .emailVerified(true)
                .build());
    }

    @Test
    void loginContinuaAFuncionarComORedisEmBaixo() throws Exception {
        String email = "redis-down-" + UUID.randomUUID() + "@example.com";
        createUser(email, "Test@123");

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"Test@123"}
                                """.formatted(email)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.email").value(email))
                .andExpect(jsonPath("$.data.csrfToken").exists())
                // Sessão emitida na mesma: sem refresh token no Redis a sessão
                // vale pelo access token (1 h) — não se expulsa ninguém por o
                // Redis estar em baixo.
                .andExpect(cookie().exists("nsm_at"))
                .andExpect(cookie().exists("nsm_rt"));
    }

    @Test
    void pedidoAutenticadoContinuaAPassarComORedisEmBaixo() throws Exception {
        String email = "redis-down-me-" + UUID.randomUUID() + "@example.com";
        createUser(email, "Test@123");

        MvcResult login = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"Test@123"}
                                """.formatted(email)))
                .andExpect(status().isOk())
                .andReturn();

        Cookie access = login.getResponse().getCookie("nsm_at");

        // A inatividade da sessão, a revogação e a validação do refresh token são
        // todas verificadas no Redis: nenhuma pode recusar o pedido quando o
        // Redis está indisponível (fail-open) — senão o login funcionava e a
        // sessão morria logo a seguir.
        mockMvc.perform(get("/api/auth/me").cookie(access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.email").value(email));
    }

    @Test
    void passwordErradaContinuaADevolver401SemBloquearConta() throws Exception {
        String email = "redis-down-bad-" + UUID.randomUUID() + "@example.com";
        createUser(email, "Test@123");

        // O registo de tentativas falhadas não pode gravar nada (Redis em baixo):
        // o login tem de responder na mesma com 401 de credenciais e NÃO com 500
        // nem com um bloqueio inventado.
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"Errada@123"}
                                """.formatted(email)))
                .andExpect(status().isUnauthorized());
    }
}
