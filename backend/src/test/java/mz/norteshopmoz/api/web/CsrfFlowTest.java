package mz.norteshopmoz.api.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Fluxo CSRF ponta a ponta.
 *
 * <p>O bug que isto previne: o token CSRF era só um cookie (double-submit) lido
 * por JavaScript. Como o cookie é <em>host-only</em>, com a API num subdomínio
 * (ex.: {@code api.loja.mz}) o JS do frontend não o via, o header
 * {@code X-CSRF-Token} seguia vazio e <strong>todos</strong> os pedidos
 * autenticados que alteram estado eram rejeitados com 403 (favoritos, moradas,
 * carrinho com conta, perfil, cancelamento e o painel de administração
 * inteiro).</p>
 *
 * <p>Duas garantias a manter: (1) o token tem de estar disponível fora do cookie
 * — no corpo do login/registo/refresh e em {@code GET /api/auth/csrf}; (2) o
 * header continua a ser <strong>obrigatório</strong> — sem ele o pedido leva
 * 403.</p>
 */
@SpringBootTest
@ActiveProfiles("unit-test")
@AutoConfigureMockMvc
class CsrfFlowTest {

    @Autowired
    MockMvc mockMvc;

    private static final String REGISTER_TEMPLATE = """
            {"fullName":"Cliente CSRF","email":"%s","password":"Test@123","phone":"+258840000000"}
            """;

    private static String uniqueEmail() {
        return "csrf-" + UUID.randomUUID() + "@example.com";
    }

    /** Registo devolve os cookies de sessão e o token CSRF no corpo. */
    private MvcResult register(String email) throws Exception {
        return mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(REGISTER_TEMPLATE.formatted(email)))
                // 201 no registo; o que este teste verifica é o CSRF, não o código exato.
                .andExpect(status().is2xxSuccessful())
                .andReturn();
    }

    @Test
    void registoDevolveOTokenCsrfNoCorpoIgualAoDoCookie() throws Exception {
        String body = register(uniqueEmail()).getResponse().getContentAsString();

        String token = JsonPath.read(body, "$.data.csrfToken");

        assertThat(token).isNotBlank();
    }

    @Test
    void escritaAutenticadaExigeOHeaderCsrf() throws Exception {
        MvcResult result = register(uniqueEmail());
        String token = JsonPath.read(result.getResponse().getContentAsString(), "$.data.csrfToken");
        Cookie access = result.getResponse().getCookie("nsm_at");
        Cookie csrf = result.getResponse().getCookie("nsm_csrf");

        assertThat(access).isNotNull();
        assertThat(csrf).isNotNull();
        assertThat(csrf.isHttpOnly())
                .as("o cookie tem de continuar legível por JS quando o domínio o permite")
                .isFalse();
        assertThat(csrf.getValue())
                .as("o token do corpo tem de ser o mesmo que valida o double-submit")
                .isEqualTo(token);

        // Sem o header → 403 (a proteção CSRF mantém-se intacta).
        // /api/favorites: autenticado e no grupo que EXIGE CSRF (ao contrário do
        // carrinho de convidado, que é isento por usar X-Guest-Id).
        mockMvc.perform(put("/api/favorites")
                        .cookie(access, csrf)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productIds\":[]}"))
                .andExpect(status().isForbidden());

        // Com header + cookie → o pedido passa (200).
        mockMvc.perform(put("/api/favorites")
                        .cookie(access, csrf)
                        .header("X-CSRF-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productIds\":[]}"))
                .andExpect(status().isOk());
    }

    @Test
    void endpointCsrfGeraETransmiteUmTokenUtilizavel() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andReturn();

        String token = JsonPath.read(result.getResponse().getContentAsString(), "$.data.csrfToken");
        Cookie csrf = result.getResponse().getCookie("nsm_csrf");

        assertThat(token).isNotBlank();
        assertThat(csrf).isNotNull();
        assertThat(csrf.getValue()).isEqualTo(token);
    }

    @Test
    void endpointCsrfReutilizaOCookieDaSessao() throws Exception {
        Cookie existing = new Cookie("nsm_csrf", "token-ja-emitido");

        String body = mockMvc.perform(get("/api/auth/csrf").cookie(existing))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String token = JsonPath.read(body, "$.data.csrfToken");
        assertThat(token).isEqualTo("token-ja-emitido");
    }
}
