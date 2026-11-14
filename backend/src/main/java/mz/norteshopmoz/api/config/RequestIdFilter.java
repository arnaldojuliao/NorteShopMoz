package mz.norteshopmoz.api.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Identificador de correlação por pedido.
 *
 * <p>Um pedido atravessa o nginx, a API, o gateway de pagamento (webhook), o
 * envio de email e o WhatsApp. Sem um identificador comum, juntar as linhas de
 * log de um pedido concreto («o cliente X diz que o pedido falhou») é procurar
 * por data e palpite. Este filtro:</p>
 *
 * <ul>
 *   <li>reaproveita o {@code X-Request-Id} de quem já o tem (o nginx ou um
 *       proxy externo), desde que tenha um formato seguro — sem esta validação
 *       um cliente podia injetar quebras de linha nos logs;</li>
 *   <li>gera um UUID quando não vem nenhum;</li>
 *   <li>coloca-o no {@link MDC} (aparece em todas as linhas de log do pedido,
 *       incluindo as tarefas assíncronas — ver o {@code TaskDecorator} do
 *       AsyncConfig) e devolve-o no header da resposta, para o suporte poder
 *       pedi-lo ao cliente.</li>
 * </ul>
 *
 * <p>Corre antes de tudo o resto ({@link Ordered#HIGHEST_PRECEDENCE}) para que
 * até os logs dos filtros de segurança já tragam o identificador.</p>
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    /** Header de entrada/saída do identificador de correlação. */
    public static final String HEADER = "X-Request-Id";

    /** Chave no MDC (e no padrão de log definido em application.yaml). */
    public static final String MDC_KEY = "requestId";

    /**
     * Formato aceite de um identificador externo: curto, alfanumérico e sem
     * espaços nem controlos. Tudo o resto é substituído por um UUID — e não
     * truncado/saneado, para nunca haver dois pedidos com o mesmo ID.
     */
    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9._-]{8,64}$");

    /** Identificador do pedido atual, ou {@code null} fora de um pedido. */
    public static String currentRequestId() {
        return MDC.get(MDC_KEY);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String incoming = request.getHeader(HEADER);
        String requestId = incoming != null && SAFE_ID.matcher(incoming).matches()
                ? incoming
                : UUID.randomUUID().toString();

        MDC.put(MDC_KEY, requestId);
        // Exposto já antes do handler: um erro nos filtros seguintes (rate limit,
        // CSRF) chega ao cliente com o mesmo ID que está no log.
        response.setHeader(HEADER, requestId);
        try {
            filterChain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }
}
