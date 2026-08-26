package mz.norteshopmoz.api.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Adiciona headers de segurança a todas as respostas HTTP.
 * Complementa os headers do Nginx (defesa em profundidade).
 */
@Component
public class SecurityHeadersFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        // HSTS - força HTTPS por 1 ano com preload
        response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");

        // Previne clickjacking
        response.setHeader("X-Frame-Options", "DENY");

        // Previne MIME type sniffing
        response.setHeader("X-Content-Type-Options", "nosniff");

        // Proteção XSS legada (ainda útil para browsers antigos)
        response.setHeader("X-XSS-Protection", "1; mode=block");

        // Referrer policy restritiva
        response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

        // Permissions Policy - desabilita APIs sensíveis
        response.setHeader("Permissions-Policy",
                "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()");

        // Cache control para endpoints sensíveis
        String path = request.getRequestURI();
        if (path.startsWith("/api/auth") || path.startsWith("/api/orders") || path.startsWith("/api/cart")) {
            response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
            response.setHeader("Pragma", "no-cache");
            response.setHeader("Expires", "0");
        }

        // Remove header Server para information disclosure
        response.setHeader("Server", "NorteShopMoz");

        filterChain.doFilter(request, response);
    }
}