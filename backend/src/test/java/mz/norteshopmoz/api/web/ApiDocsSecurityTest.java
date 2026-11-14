package mz.norteshopmoz.api.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
 * A documentação da API (springdoc/Swagger) expõe toda a superfície interna,
 * incluindo as rotas {@code /api/admin/**}.
 *
 * <p>Antes, estes caminhos caíam em {@code .anyRequest().authenticated()}: qualquer
 * comprador com sessão abria o Swagger e via todos os endpoints. Agora exige
 * ADMIN, e em produção o springdoc está desligado (ver application.yaml).</p>
 */
@SpringBootTest
@ActiveProfiles("unit-test")
@AutoConfigureMockMvc
class ApiDocsSecurityTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JwtService jwtService;

    private String token(String role) {
        UserAccount user = UserAccount.builder()
                .id("docs-" + UUID.randomUUID())
                .email("docs@example.com")
                .fullName("Documentação")
                .passwordHash("hash")
                .role(role)
                .build();
        return jwtService.generateToken(user, null);
    }

    @Test
    void anonimoNaoVeADocumentacao() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void clienteAutenticadoNaoVeADocumentacao() throws Exception {
        mockMvc.perform(get("/v3/api-docs")
                        .header("Authorization", "Bearer " + token("CUSTOMER")))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminVeADocumentacao() throws Exception {
        mockMvc.perform(get("/v3/api-docs")
                        .header("Authorization", "Bearer " + token("ADMIN")))
                .andExpect(status().isOk());
    }

    @Test
    void swaggerUiTambemExigeAdmin() throws Exception {
        mockMvc.perform(get("/swagger-ui/index.html")
                        .header("Authorization", "Bearer " + token("CUSTOMER")))
                .andExpect(status().isForbidden());
    }
}
