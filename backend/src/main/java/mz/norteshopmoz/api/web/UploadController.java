package mz.norteshopmoz.api.web;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.CloudinaryService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * Upload de imagens de produto — apenas administradores (role ADMIN, verificado
 * aqui e no SecurityConfig). Com credenciais Cloudinary configuradas, a imagem é
 * enviada para a nuvem (CDN + otimização); caso contrário (dev sem credenciais)
 * é guardada no diretório {@code UPLOAD_DIR} e servida em {@code /uploads/**}.
 * Devolve a URL absoluta para ser usada na lista {@code images} do produto.
 */
@RestController
@RequestMapping("/api")
public class UploadController {

    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("jpg", "jpeg", "png", "webp", "gif", "avif");

    private final CloudinaryService cloudinaryService;
    private final Path uploadDir;

    public UploadController(
            CloudinaryService cloudinaryService,
            @Value("${app.upload-dir:./uploads}") String uploadDir) {
        this.cloudinaryService = cloudinaryService;
        this.uploadDir = Path.of(uploadDir).toAbsolutePath().normalize();
    }

    @PostMapping("/upload")
    public ResponseEntity<?> upload(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Não autenticado");
        }
        if (!"ADMIN".equalsIgnoreCase(principal.role())) {
            throw ApiException.forbidden("Apenas administradores podem enviar imagens");
        }
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("Envie um ficheiro de imagem");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.toLowerCase(Locale.ROOT).startsWith("image/")) {
            throw ApiException.badRequest("Apenas ficheiros de imagem são permitidos");
        }
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        String ext = extensionOf(original);
        if (!ALLOWED_EXTENSIONS.contains(ext)) {
            throw ApiException.badRequest("Formato de imagem não suportado (use JPG, PNG, WEBP, GIF ou AVIF)");
        }

        String url;
        if (cloudinaryService.isConfigured()) {
            // Cloudinary: CDN + otimização automática.
            url = cloudinaryService.upload(file);
        } else {
            // Fallback local (dev sem credenciais) — nome único e imprevisível.
            String filename = UUID.randomUUID().toString().replace("-", "") + "." + ext;
            try {
                Files.createDirectories(uploadDir);
                file.transferTo(uploadDir.resolve(filename));
            } catch (IOException e) {
                throw ApiException.badRequest("Não foi possível guardar a imagem");
            }
            url = ServletUriComponentsBuilder.fromCurrentContextPath()
                    .path("/uploads/").path(filename).toUriString();
        }

        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.data(Map.of("url", url)));
    }

    private static String extensionOf(String original) {
        int dot = original.lastIndexOf('.');
        if (dot < 0 || dot == original.length() - 1) {
            return "";
        }
        return original.substring(dot + 1).toLowerCase(Locale.ROOT);
    }
}
