package mz.norteshopmoz.api.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import mz.norteshopmoz.api.domain.UserAccount;
import mz.norteshopmoz.api.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Autorização do endpoint de estatísticas de vendas (GET /api/orders/admin/stats).
 *
 * <p>Os dados agregados são internos: só um administrador os pode ver. O matcher
 * do SecurityConfig é a barreira principal; o controller tem uma segunda
 * verificação de role (defesa em profundidade).</p>
 */
@SpringBootTest
@ActiveProfiles("unit-test")
@AutoConfigureMockMvc
class AdminStatsSecurityTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JwtService jwtService;

    /**
     * Token de acesso para um utilizador não persistido. O filtro JWT relê a role
     * da base de dados e, não encontrando o uid, mantém a role da claim — o que
     * permite testar cada role sem criar contas.
     */
    private String token(String role) {
        UserAccount user = UserAccount.builder()
                .id("stats-" + UUID.randomUUID())
                .email("stats@example.com")
                .fullName("Estatísticas")
                .passwordHash("hash")
                .role(role)
                .build();
        // Sem sid: não passa pelo idle timeout (não depende do Redis no teste).
        return jwtService.generateToken(user, null);
    }

    @Test
    void semTokenDevolve401() throws Exception {
        mockMvc.perform(get("/api/orders/admin/stats"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void comRoleDeClienteDevolve403() throws Exception {
        mockMvc.perform(get("/api/orders/admin/stats")
                        .header("Authorization", "Bearer " + token("CUSTOMER")))
                .andExpect(status().isForbidden());
    }

    @Test
    void comRoleAdminDevolveAsEstatisticas() throws Exception {
        mockMvc.perform(get("/api/orders/admin/stats")
                        .header("Authorization", "Bearer " + token("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalOrders").exists())
                .andExpect(jsonPath("$.data.revenue").exists())
                .andExpect(jsonPath("$.data.topProducts").isArray())
                .andExpect(jsonPath("$.data.days").isArray());
    }
}
