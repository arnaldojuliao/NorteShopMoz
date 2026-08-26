package mz.norteshopmoz.api.config;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Optional;

/**
 * Utilitário para gerir cookies HttpOnly seguros para tokens JWT.
 * Access token: cookie de sessão (expira ao fechar browser) ou persistente (rememberMe).
 * Refresh token: cookie persistente HttpOnly; SameSite=Strict para CSRF protection.
 */
@Component
public class JwtCookieService {

    private static final String ACCESS_COOKIE = "nsm_at";
    private static final String REFRESH_COOKIE = "nsm_rt";
    private static final String CSRF_COOKIE = "nsm_csrf";

    private final boolean secure;
    private final String domain;
    private final int accessTokenMaxAgeSeconds;
    private final int refreshTokenMaxAgeSeconds;

    public JwtCookieService(
            @Value("${app.cookie.secure:true}") boolean secure,
            @Value("${app.cookie.domain:}") String domain,
            @Value("${app.jwt.expiration-seconds:604800}") int accessTokenMaxAgeSeconds,
            @Value("${app.jwt.refresh-expiration-seconds:2592000}") int refreshTokenMaxAgeSeconds) {
        this.secure = secure;
        this.domain = domain.isBlank() ? null : domain;
        this.accessTokenMaxAgeSeconds = accessTokenMaxAgeSeconds;
        this.refreshTokenMaxAgeSeconds = refreshTokenMaxAgeSeconds;
    }

    /** Define access token em cookie HttpOnly. */
    public void setAccessToken(HttpServletResponse response, String token, boolean rememberMe) {
        Cookie cookie = createCookie(ACCESS_COOKIE, token, rememberMe ? accessTokenMaxAgeSeconds : -1, "/api");
        response.addCookie(cookie);
    }

    /** Define refresh token em cookie HttpOnly (SameSite=Strict). */
    public void setRefreshToken(HttpServletResponse response, String token) {
        Cookie cookie = createCookie(REFRESH_COOKIE, token, refreshTokenMaxAgeSeconds, "/api/auth/refresh");
        cookie.setAttribute("SameSite", "Strict");
        response.addCookie(cookie);
    }

    /** Define CSRF token em cookie acessível via JS (SameSite=Strict). */
    public void setCsrfToken(HttpServletResponse response, String token) {
        Cookie cookie = createCookie(CSRF_COOKIE, token, refreshTokenMaxAgeSeconds, "/");
        cookie.setHttpOnly(false); // Precisa ser lido pelo frontend para header
        cookie.setAttribute("SameSite", "Strict");
        response.addCookie(cookie);
    }

    /** Remove todos os cookies de autenticação (logout). */
    public void clearAuthCookies(HttpServletResponse response) {
        clearCookie(response, ACCESS_COOKIE, "/api");
        clearCookie(response, REFRESH_COOKIE, "/api/auth/refresh");
        clearCookie(response, CSRF_COOKIE, "/");
    }

    /** Lê access token do cookie. */
    public Optional<String> getAccessToken(HttpServletRequest request) {
        return readCookie(request, ACCESS_COOKIE);
    }

    /** Lê refresh token do cookie. */
    public Optional<String> getRefreshToken(HttpServletRequest request) {
        return readCookie(request, REFRESH_COOKIE);
    }

    /** Lê CSRF token do cookie. */
    public Optional<String> getCsrfToken(HttpServletRequest request) {
        return readCookie(request, CSRF_COOKIE);
    }

    /** Valida CSRF token do header contra cookie (double-submit cookie pattern). */
    public boolean validateCsrf(HttpServletRequest request) {
        String headerToken = request.getHeader("X-CSRF-Token");
        if (headerToken == null || headerToken.isBlank()) {
            return false;
        }
        return getCsrfToken(request).map(headerToken::equals).orElse(false);
    }

    private Cookie createCookie(String name, String value, int maxAge, String path) {
        Cookie cookie = new Cookie(name, value);
        cookie.setHttpOnly(true);
        cookie.setSecure(secure);
        cookie.setPath(path);
        cookie.setMaxAge(maxAge);
        if (domain != null) {
            cookie.setDomain(domain);
        }
        cookie.setAttribute("SameSite", "Lax"); // Default para access token
        return cookie;
    }

    private void clearCookie(HttpServletResponse response, String name, String path) {
        Cookie cookie = new Cookie(name, "");
        cookie.setHttpOnly(true);
        cookie.setSecure(secure);
        cookie.setPath(path);
        cookie.setMaxAge(0);
        if (domain != null) {
            cookie.setDomain(domain);
        }
        response.addCookie(cookie);
    }

    private Optional<String> readCookie(HttpServletRequest request, String name) {
        if (request.getCookies() == null) return Optional.empty();
        return Arrays.stream(request.getCookies())
                .filter(c -> name.equals(c.getName()))
                .map(Cookie::getValue)
                .findFirst();
    }
}