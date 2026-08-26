package mz.norteshopmoz.api.service;

import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import mz.norteshopmoz.api.config.AppProperties;
import mz.norteshopmoz.api.exception.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * Verificação de identidade para login social (Google/Facebook).
 * <p>
 * O token emitido pelo fornecedor (ID token do Google ou access token do Facebook)
 * é validado junto do próprio fornecedor e convertido num perfil normalizado
 * (email, nome, foto). Nunca confia no conteúdo do token — a validação é feita
 * via API do fornecedor (tokeninfo do Google / Graph API do Facebook).
 */
@Service
public class SocialAuthService {

    private static final Logger log = LoggerFactory.getLogger(SocialAuthService.class);
    private static final String GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
    private static final String FACEBOOK_GRAPH_URL = "https://graph.facebook.com";

    private final AppProperties props;
    private final RestClient restClient;

    public SocialAuthService(AppProperties props) {
        this.props = props;
        // Cliente construído diretamente, com timeouts tolerantes a redes instáveis —
        // o login falha rápido mas sem rejeitar fornecedores lentos.
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(12_000);
        applyProxyFromEnv(factory);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    /** Perfil normalizado devolvido pelo fornecedor após validação do token. */
    public record SocialProfile(String provider, String email, String fullName, String avatar) {}

    /** Valida o token junto do fornecedor e devolve o perfil. Lança ApiException se inválido. */
    public SocialProfile verify(String provider, String token) {
        return switch (provider == null ? "" : provider.toLowerCase()) {
            case "google" -> verifyGoogle(token);
            case "facebook" -> verifyFacebook(token);
            default -> throw ApiException.badRequest("Fornecedor de login social não suportado");
        };
    }

    /* ── Google (ID token verificado no endpoint tokeninfo) ─────────── */

    private SocialProfile verifyGoogle(String idToken) {
        String clientId = props.social().googleClientId();
        if (clientId == null || clientId.isBlank()) {
            throw ApiException.badRequest("Login com Google não configurado");
        }
        Map<?, ?> payload;
        try {
            String url = GOOGLE_TOKENINFO_URL + "?id_token=" + encode(idToken);
            payload = restClient.get().uri(url).retrieve().body(Map.class);
        } catch (Exception e) {
            throw ApiException.unauthorized("Não foi possível validar o login com o Google");
        }
        if (payload == null) {
            throw ApiException.unauthorized("Token do Google inválido");
        }
        // O tokeninfo devolve `aud` = client ID para o qual o token foi emitido.
        if (!clientId.equals(payload.get("aud"))) {
            throw ApiException.unauthorized("Token do Google inválido para esta aplicação");
        }
        if (!"true".equals(String.valueOf(payload.get("email_verified")))) {
            throw ApiException.unauthorized("O email da conta Google não está verificado");
        }
        String email = stringOrNull(payload.get("email"));
        if (email == null || email.isBlank()) {
            throw ApiException.unauthorized("A conta Google não tem email associado");
        }
        return new SocialProfile("google", email.toLowerCase(),
                stringOrNull(payload.get("name")), stringOrNull(payload.get("picture")));
    }

    /* ── Facebook (access token validado na Graph API) ──────────────── */

    private SocialProfile verifyFacebook(String accessToken) {
        String appId = props.social().facebookAppId();
        String appSecret = props.social().facebookAppSecret();
        if (appId == null || appId.isBlank()) {
            throw ApiException.badRequest("Login com Facebook não configurado");
        }
        // Confirma que o token pertence à nossa app (debug_token exige o app secret;
        // sem secret, a validação do /me abaixo é a única barreira).
        if (appSecret != null && !appSecret.isBlank()) {
            Map<?, ?> debug = graphGet("/debug_token", Map.of(
                    "input_token", accessToken,
                    "access_token", appId + "|" + appSecret));
            Object data = debug != null ? debug.get("data") : null;
            if (!(data instanceof Map<?, ?> info)
                    || !Boolean.TRUE.equals(info.get("is_valid"))
                    || !appId.equals(String.valueOf(info.get("app_id")))) {
                throw ApiException.unauthorized("Token do Facebook inválido");
            }
        }
        Map<?, ?> me = graphGet("/me", Map.of(
                "fields", "id,name,email,picture.type(large)",
                "access_token", accessToken));
        if (me == null || me.containsKey("error") || me.get("id") == null) {
            throw ApiException.unauthorized("Token do Facebook inválido ou expirado");
        }
        String email = stringOrNull(me.get("email"));
        if (email == null || email.isBlank()) {
            throw ApiException.unauthorized(
                    "A conta do Facebook não partilhou o email — entre com email e palavra-passe");
        }
        return new SocialProfile("facebook", email.toLowerCase(),
                stringOrNull(me.get("name")), pictureUrl(me.get("picture")));
    }

    private Map<?, ?> graphGet(String path, Map<String, String> params) {
        try {
            String query = params.entrySet().stream()
                    .map(e -> e.getKey() + "=" + encode(e.getValue()))
                    .reduce((a, b) -> a + "&" + b)
                    .orElse("");
            return restClient.get().uri(FACEBOOK_GRAPH_URL + path + "?" + query)
                    .retrieve().body(Map.class);
        } catch (Exception e) {
            throw ApiException.unauthorized("Não foi possível validar o login com o Facebook");
        }
    }

    private static String pictureUrl(Object picture) {
        if (!(picture instanceof Map<?, ?> pic) || !(pic.get("data") instanceof Map<?, ?> data)) {
            return null;
        }
        return stringOrNull(data.get("url"));
    }

    private static String stringOrNull(Object value) {
        if (value == null) return null;
        String s = String.valueOf(value);
        return s.isBlank() || "null".equals(s) ? null : s;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    /**
     * Usa o proxy das variáveis de ambiente (HTTPS_PROXY/https_proxy), como o curl:
     * o Java por omissão não lê estas variáveis e falha em redes com proxy obrigatório.
     */
    private static void applyProxyFromEnv(SimpleClientHttpRequestFactory factory) {
        String proxyUrl = System.getenv("HTTPS_PROXY");
        if (proxyUrl == null || proxyUrl.isBlank()) {
            proxyUrl = System.getenv("https_proxy");
        }
        if (proxyUrl == null || proxyUrl.isBlank()) {
            return; // sem proxy → ligação direta (produção normal)
        }
        try {
            URI uri = URI.create(proxyUrl);
            String host = uri.getHost();
            int port = uri.getPort() > 0 ? uri.getPort() : 8080;
            if (host != null) {
                factory.setProxy(new Proxy(Proxy.Type.HTTP, new InetSocketAddress(host, port)));
            }
        } catch (IllegalArgumentException e) {
            log.warn("HTTPS_PROXY inválido ({}), a ligar diretamente", proxyUrl);
        }
    }
}
