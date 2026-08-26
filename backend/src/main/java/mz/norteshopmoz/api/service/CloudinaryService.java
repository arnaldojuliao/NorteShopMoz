package mz.norteshopmoz.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.UUID;
import mz.norteshopmoz.api.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Envio de imagens de produto para a Cloudinary (armazenamento + CDN) via API
 * REST oficial (upload assinado com SHA-1), usando apenas o {@link HttpClient}
 * do JDK — sem dependência externa.
 *
 * <p>Credenciais configuráveis via {@code CLOUDINARY_CLOUD_NAME},
 * {@code CLOUDINARY_API_KEY} e {@code CLOUDINARY_API_SECRET} — em produção devem
 * vir de variáveis de ambiente.</p>
 */
@Service
public class CloudinaryService {

    private static final String API_BASE = "https://api.cloudinary.com/v1_1/";
    private static final String FOLDER = "norteshopmoz/products";
    /**
     * Transformações aplicadas às URLs: formato automático (WebP/AVIF), qualidade
     * otimizada e largura máxima de 1600px (o next/image redimensiona a partir daí).
     */
    private static final String TRANSFORMATIONS = "f_auto,q_auto,w_1600";

    private final HttpClient http;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String cloudName;
    private final String apiKey;
    private final String apiSecret;

    public CloudinaryService(
            @Value("${app.cloudinary.cloud-name:}") String cloudName,
            @Value("${app.cloudinary.api-key:}") String apiKey,
            @Value("${app.cloudinary.api-secret:}") String apiSecret) {
        this.cloudName = cloudName;
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.http = buildHttpClient();
    }

    /**
     * Cliente HTTP que respeita as variáveis de proxy padrão (HTTPS_PROXY/HTTP_PROXY)
     * quando presentes — caso contrário liga diretamente. O HttpClient do JDK não lê
     * variáveis de ambiente sozinho, ao contrário de curl.
     */
    private static HttpClient buildHttpClient() {
        HttpClient.Builder builder = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10));
        String proxyUrl = firstNonBlank(System.getenv("HTTPS_PROXY"), System.getenv("https_proxy"));
        if (proxyUrl == null) {
            proxyUrl = firstNonBlank(System.getenv("HTTP_PROXY"), System.getenv("http_proxy"));
        }
        if (proxyUrl != null) {
            try {
                URI uri = URI.create(proxyUrl);
                int port = uri.getPort() == -1 ? 8080 : uri.getPort();
                builder.proxy(ProxySelector.of(new InetSocketAddress(uri.getHost(), port)));
            } catch (IllegalArgumentException ignored) {
                // URL de proxy inválida — segue sem proxy.
            }
        }
        return builder.build();
    }

    private static String firstNonBlank(String a, String b) {
        return a != null && !a.isBlank() ? a : (b != null && !b.isBlank() ? b : null);
    }

    /** Verdadeiro quando as três credenciais estão preenchidas (upload na nuvem). */
    public boolean isConfigured() {
        return !cloudName.isEmpty() && !apiKey.isEmpty() && !apiSecret.isEmpty();
    }

    /**
     * Envia o ficheiro para a Cloudinary (pasta de produtos) e devolve a URL
     * pública segura (HTTPS) para usar na lista {@code images} do produto.
     */
    public String upload(MultipartFile file) {
        try {
            String timestamp = String.valueOf(System.currentTimeMillis() / 1000);
            // Assinatura: parâmetros ordenados por nome (sem file/api_key/cloud_name/signature)
            // concatenados + api_secret, com hash SHA-1.
            String params = "folder=" + FOLDER + "&timestamp=" + timestamp;
            String signature = sha1(params + apiSecret);

            String boundary = "----NSM" + UUID.randomUUID();
            byte[] body = multipartBody(boundary, file, timestamp, signature);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(API_BASE + cloudName + "/image/upload"))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                    .build();

            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw ApiException.badRequest(
                        "A Cloudinary rejeitou a imagem (HTTP " + response.statusCode() + ")");
            }
            String url = objectMapper.readTree(response.body()).path("secure_url").asText(null);
            if (url == null || url.isBlank()) {
                throw ApiException.badRequest("A Cloudinary não devolveu uma URL válida");
            }
            return withTransformations(url);
        } catch (IOException e) {
            throw ApiException.badRequest("Não foi possível enviar a imagem para a Cloudinary");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw ApiException.badRequest("Não foi possível enviar a imagem para a Cloudinary");
        }
    }

    /** Insere as transformações na URL após o segmento /image/upload/. */
    private static String withTransformations(String url) {
        String marker = "/image/upload/";
        int idx = url.indexOf(marker);
        if (idx < 0) {
            return url;
        }
        int insertAt = idx + marker.length();
        return url.substring(0, insertAt) + TRANSFORMATIONS + "/" + url.substring(insertAt);
    }

    /** Corpo multipart/form-data: campos de texto + o ficheiro binário. */
    private byte[] multipartBody(String boundary, MultipartFile file, String timestamp, String signature)
            throws IOException {
        StringBuilder sb = new StringBuilder();
        addField(sb, boundary, "api_key", apiKey);
        addField(sb, boundary, "timestamp", timestamp);
        addField(sb, boundary, "folder", FOLDER);
        addField(sb, boundary, "signature", signature);
        sb.append("--").append(boundary).append("\r\n");
        sb.append("Content-Disposition: form-data; name=\"file\"; filename=\"")
                .append(sanitizeFilename(file.getOriginalFilename())).append("\"\r\n");
        sb.append("Content-Type: ")
                .append(file.getContentType() != null ? file.getContentType() : "application/octet-stream")
                .append("\r\n\r\n");

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(sb.toString().getBytes(StandardCharsets.UTF_8));
        out.write(file.getBytes());
        out.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        return out.toByteArray();
    }

    private static void addField(StringBuilder sb, String boundary, String name, String value) {
        sb.append("--").append(boundary).append("\r\n");
        sb.append("Content-Disposition: form-data; name=\"").append(name).append("\"\r\n\r\n");
        sb.append(value).append("\r\n");
    }

    private static String sanitizeFilename(String name) {
        String base = name == null ? "imagem.jpg" : name.replaceAll("[^\\w.\\-]", "_");
        return base.isBlank() ? "imagem.jpg" : base;
    }

    private static String sha1(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            return HexFormat.of().formatHex(digest.digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-1 indisponível", e);
        }
    }
}
