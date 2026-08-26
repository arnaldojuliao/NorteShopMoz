package mz.norteshopmoz.api.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

/**
 * Configuração do OpenAPI (Swagger UI + OpenAPI JSON).
 * <p>
 * Disponibiliza:
 * - Swagger UI: <code>/swagger-ui.html</code>
 * - OpenAPI JSON: <code>/v3/api-docs</code>
 * - OpenAPI YAML: <code>/v3/api-docs.yaml</code>
 */
@Configuration
public class OpenApiConfig {

    @Value("${server.port:8080}")
    private String serverPort;

    @Value("${app.cors.allowed-origins[0]:http://localhost:3000}")
    private String frontendUrl;

    @Bean
    public OpenAPI openAPI() {
        String serverUrl = "http://localhost:" + serverPort;

        return new OpenAPI()
                .servers(List.of(
                        new Server().url(serverUrl).description("Desenvolvimento local"),
                        new Server().url(frontendUrl.replace("3000", "8080")).description("Produção (exemplo)")
                ))
                .info(new Info()
                        .title("NorteShopMoz API")
                        .version("0.0.1-SNAPSHOT")
                        .description("""
                                API REST da NorteShopMoz — E-commerce Moçambicano.
                                
                                ## Autenticação
                                A API utiliza JWT em cookies HttpOnly (nsm_at, nsm_rt).
                                O token de acesso é enviado automaticamente pelo navegador.
                                
                                Para testar endpoints protegidos no Swagger UI:
                                1. Faça login via <code>POST /api/auth/login</code>
                                2. O cookie <code>nsm_at</code> será definido automaticamente
                                3. As requisições subsequentes incluirão o cookie automaticamente
                                
                                ## Rate Limiting
                                - <code>/api/auth/**</code>: 10 req/min
                                - <code>/api/**</code>: 100 req/min
                                - Headers de resposta: <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>, <code>Retry-After</code>
                                
                                ## Códigos de erro
                                - <code>400</code>: Validação / Requisição inválida
                                - <code>401</code>: Não autenticado / Token inválido
                                - <code>403</code>: Sem permissão (ex.: não é admin)
                                - <code>404</code>: Recurso não encontrado
                                - <code>429</code>: Rate limit excedido (<code>Retry-After</code> em segundos)
                                """)
                        .contact(new Contact()
                                .name("Equipe NorteShopMoz")
                                .email("apoio@norteshop.com")
                                .url(frontendUrl))
                        .license(new License()
                                .name("Proprietário")
                                .url("")))
                .components(new Components()
                        .addSecuritySchemes("cookieAuth", new SecurityScheme()
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.COOKIE)
                                .name("nsm_at")
                                .description("JWT Access Token em cookie HttpOnly (definido automaticamente no login)"))
                        .addSecuritySchemes("csrfAuth", new SecurityScheme()
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.HEADER)
                                .name("X-CSRF-Token")
                                .description("CSRF Token para operações de escrita (obtido via cookie nsm_csrf)")))
                .security(List.of(
                        new SecurityRequirement().addList("cookieAuth"),
                        new SecurityRequirement().addList("csrfAuth")
                ));
    }
}