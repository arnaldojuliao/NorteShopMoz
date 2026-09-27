package mz.norteshopmoz.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * Lockout de login — o caso que interessa proteger aqui é o <strong>CGNAT</strong>:
 * em redes móveis, milhares de clientes partilham o mesmo IP público. Com o
 * limite por IP único (20 falhas) que existia antes, as passwords erradas de
 * alguns clientes bloqueavam o login de todos os outros atrás desse IP.
 *
 * <p>Usa o Redis real (perfil {@code unit-test}, porta 6381) para exercitar os
 * TTL e os contadores a sério; cada teste gera o seu próprio IP/email para não
 * haver partilha de chaves entre execuções.</p>
 */
@SpringBootTest
@ActiveProfiles("unit-test")
class LoginAttemptServiceTest {

    @Autowired
    StringRedisTemplate redis;

    /** Instância com limiares explícitos (mesma lógica, valores previsíveis). */
    private LoginAttemptService service(int pair, int email, int ip) {
        return new LoginAttemptService(redis, pair, email, ip, 15, 5);
    }

    private static String uniqueIp() {
        return "198.51.100." + UUID.randomUUID();
    }

    private static String uniqueEmail(String prefix) {
        return prefix + "-" + UUID.randomUUID() + "@example.com";
    }

    @Test
    void cincoFalhasBloqueiamApenasOParIpEmail() {
        LoginAttemptService service = service(5, 15, 200);
        String ip = uniqueIp(); // o mesmo IP partilhado por vários clientes
        String clienteQueErrou = uniqueEmail("errou");
        String outroCliente = uniqueEmail("outro");

        for (int i = 0; i < 5; i++) {
            service.recordFailure(ip, clienteQueErrou);
        }

        assertThat(service.isBlocked(ip, clienteQueErrou)).isTrue();
        assertThat(service.isBlocked(ip, outroCliente))
                .as("outro cliente no mesmo IP (CGNAT) tem de continuar a conseguir entrar")
                .isFalse();
    }

    @Test
    void falhasDeVariosClientesNoMesmoIpNaoBloqueiamOsRestantes() {
        // 30 clientes diferentes erram a password uma vez cada, todos do mesmo IP.
        LoginAttemptService service = service(5, 15, 200);
        String ip = uniqueIp();
        for (int i = 0; i < 30; i++) {
            service.recordFailure(ip, uniqueEmail("cliente"));
        }

        assertThat(service.isBlocked(ip, uniqueEmail("cliente-novo")))
                .as("erros pontuais de 30 pessoas não podem trancar a loja para as restantes")
                .isFalse();
    }

    @Test
    void abusoDeUmIpContraMuitasContasAcabaBloqueado() {
        LoginAttemptService service = service(5, 15, 10);
        String ip = uniqueIp();
        for (int i = 0; i < 10; i++) {
            service.recordFailure(ip, uniqueEmail("contas"));
        }

        assertThat(service.isBlocked(ip, uniqueEmail("qualquer")))
                .as("um IP a falhar em 10 contas diferentes é sinal de ataque")
                .isTrue();
    }

    @Test
    void ataqueDistribuidoContraAMesmaContaEhBloqueado() {
        LoginAttemptService service = service(5, 6, 200);
        String alvo = uniqueEmail("alvo");

        // 6 falhas em IPs diferentes (o par nunca chega a 5 no mesmo IP).
        for (int i = 0; i < 6; i++) {
            service.recordFailure(uniqueIp(), alvo);
        }

        assertThat(service.isBlocked(uniqueIp(), alvo))
                .as("a conta é protegida mesmo com muitos IPs de origem")
                .isTrue();
    }

    @Test
    void loginBemSucedidoLimpaOsContadoresDoCliente() {
        LoginAttemptService service = service(5, 15, 200);
        String ip = uniqueIp();
        String email = uniqueEmail("distraido");

        service.recordFailure(ip, email);
        service.recordFailure(ip, email);
        assertThat(service.getRemainingAttempts(ip, email)).isEqualTo(3);

        service.recordSuccess(ip, email);

        assertThat(service.getRemainingAttempts(ip, email)).isEqualTo(5);
        assertThat(service.isBlocked(ip, email)).isFalse();
    }

    @Test
    void contadorDeIpNaoEhLimpoPorUmLoginValido() {
        // Um atacante não pode reiniciar o sinal de abuso do IP só por acertar
        // numa conta sua (o contador agrega contas diferentes).
        LoginAttemptService service = service(5, 15, 3);
        String ip = uniqueIp();
        String email = uniqueEmail("atacante");

        for (int i = 0; i < 3; i++) {
            service.recordFailure(ip, uniqueEmail("vitimas"));
        }
        service.recordSuccess(ip, email);

        assertThat(service.isBlocked(ip, uniqueEmail("vitima-nova"))).isTrue();
    }

    @Test
    void falhaAbertaComORedisIndisponivel() {
        StringRedisTemplate down = mock(StringRedisTemplate.class);
        // doThrow/doReturn: idiomático e seguro para métodos genéricos (hasKey/opsForValue).
        doThrow(new RuntimeException("connection refused")).when(down).hasKey(anyString());
        doThrow(new RuntimeException("connection refused")).when(down).opsForValue();
        LoginAttemptService service = new LoginAttemptService(down, 5, 15, 200, 15, 5);

        assertThat(service.isBlocked("1.2.3.4", "a@b.c"))
                .as("Redis em baixo não pode impedir todos os logins")
                .isFalse();
        assertThat(service.recordFailure("1.2.3.4", "a@b.c")).isFalse();
        assertThat(service.getLockoutRemainingSeconds("1.2.3.4", "a@b.c")).isZero();
        assertThat(service.getRemainingAttempts("1.2.3.4", "a@b.c")).isEqualTo(5);
    }

    @Test
    void lockoutDevolveTempoRestante() {
        LoginAttemptService service = service(2, 15, 200);
        String ip = uniqueIp();
        String email = uniqueEmail("bloqueado");

        service.recordFailure(ip, email);
        service.recordFailure(ip, email);

        assertThat(service.isBlocked(ip, email)).isTrue();
        assertThat(service.getLockoutRemainingSeconds(ip, email))
                .isBetween(1L, 5L * 60L)
                .isGreaterThan(0L);
        assertThat(service.getRemainingAttempts(ip, email)).isZero();
    }

    @Test
    void emailEhNormalizadoParaMinusculas() {
        LoginAttemptService service = service(2, 15, 200);
        String ip = uniqueIp();
        String email = uniqueEmail("Caso");

        service.recordFailure(ip, email.toUpperCase());
        service.recordFailure(ip, email.toUpperCase());

        assertThat(service.isBlocked(ip, email.toLowerCase())).isTrue();
    }
}
