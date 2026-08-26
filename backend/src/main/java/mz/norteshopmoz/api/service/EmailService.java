package mz.norteshopmoz.api.service;

import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.URI;
import java.text.NumberFormat;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;
import mz.norteshopmoz.api.config.AppProperties;
import mz.norteshopmoz.api.config.ShippingConfig;
import mz.norteshopmoz.api.domain.NewsletterSubscriber;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.OrderAddress;
import mz.norteshopmoz.api.domain.OrderItem;
import mz.norteshopmoz.api.domain.UserAccount;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * Email transacional (boas-vindas/verificação e pedidos) via API da Resend.
 * <p>
 * Nunca bloqueia nem falha o fluxo do utilizador: sem {@code RESEND_API_KEY}
 * (desenvolvimento) o envio é ignorado com log; falhas de rede são só avisadas.
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);
    private static final String RESEND_URL = "https://api.resend.com/emails";
    private static final DateTimeFormatter DATE_FMT =
            DateTimeFormatter.ofPattern("dd/MM/yyyy 'às' HH:mm").withZone(ZoneId.of("Africa/Maputo"));

    private final RestClient restClient;
    private final String apiKey;
    private final String from;
    private final String baseUrl;
    private final ShippingConfig shippingConfig;

    public EmailService(AppProperties props, ShippingConfig shippingConfig) {
        this.apiKey = props.mail().resendApiKey();
        this.from = props.mail().from();
        this.baseUrl = props.mail().baseUrl().replaceAll("/+$", "");
        this.shippingConfig = shippingConfig;
        // Cliente construído diretamente (sem depender de auto-configuração), com timeouts
        // que toleram redes móveis/instáveis (o envio é assíncrono — não bloqueia pedidos).
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(12_000);
        applyProxyFromEnv(factory);
        this.restClient = RestClient.builder()
                .baseUrl(RESEND_URL)
                .requestFactory(factory)
                .build();
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

    /* ── Verificação de email (registo) ─────────────────────────── */

    /**
     * Email de boas-vindas com o link de confirmação do email.
     * Assíncrono — o registo não espera pelo envio.
     */
    @Async
    public void sendVerification(UserAccount user, String verifyUrl) {
        String firstName = escapeHtml(user.getFullName().split(" ")[0]);
        String html = """
                %s
                <h2 style="margin:0 0 8px;font-size:18px">Bem-vindo(a), %s! 🎉</h2>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.6">
                  A sua conta foi criada com sucesso. Para confirmar o seu email e ficar com tudo
                  pronto para comprar, guardar favoritos e acompanhar pedidos, confirme o endereço:
                </p>
                <a href="%s" style="%s">Confirmar o meu email</a>
                <p style="margin:18px 0 0;font-size:12px;color:#64748b">
                  Se o botão não funcionar, copie e cole este link no navegador:<br>
                  <span style="color:#1f46e6;word-break:break-all">%s</span>
                </p>
                %s
                """.formatted(header(), firstName, verifyUrl, buttonStyle(), verifyUrl, footer());

        sendHtml(user.getEmail(), "Bem-vindo(a) à NorteShop — confirme o seu email", html, verifyUrl);
    }

    /* ── Recuperação de palavra-passe ──────────────────────────── */

    /** Link de reposição de palavra-passe (válido 1 hora). Assíncrono. */
    @Async
    public void sendPasswordReset(UserAccount user, String resetUrl) {
        String firstName = escapeHtml(user.getFullName().split(" ")[0]);
        String html = """
                %s
                <h2 style="margin:0 0 8px;font-size:18px">Recupere a sua palavra-passe, %s 🔑</h2>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.6">
                  Recebemos um pedido para repor a palavra-passe da sua conta NorteShop.
                  O link é válido por <strong>1 hora</strong> e só pode ser usado uma vez.
                </p>
                <a href="%s" style="%s">Repor palavra-passe</a>
                <p style="margin:16px 0 0;font-size:12px;color:#64748b">
                  Se não foi você que pediu, pode ignorar este email — a sua palavra-passe não muda.
                </p>
                %s
                """.formatted(header(), firstName, resetUrl, buttonStyle(), footer());

        sendHtml(user.getEmail(), "Repor a sua palavra-passe — NorteShop", html, resetUrl);
    }

    /* ── Newsletter ─────────────────────────────────────────────── */

    /** Boas-vindas à newsletter (assíncrono). */
    @Async
    public void sendNewsletterWelcome(NewsletterSubscriber subscriber) {
        String name = subscriber.getName();
        String firstName = name != null && !name.isBlank()
                ? escapeHtml(name.split(" ")[0])
                : "amigo(a)";
        String html = """
                %s
                <h2 style="margin:0 0 8px;font-size:18px">Bem-vindo(a) à newsletter, %s! 📬</h2>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.6">
                  A partir de agora vai receber ofertas exclusivas, novidades e cupões de
                  desconto diretamente no seu email. Pode cancelar a subscrição a qualquer momento.
                </p>
                <p style="margin:0;font-size:13px;color:#334155">
                  Enquanto isso, veja as novidades da loja:
                  <a href="%s" style="color:#1f46e6;font-weight:bold">NorteShop</a>
                </p>
                %s
                """.formatted(header(), firstName, baseUrl, footer());

        sendHtml(subscriber.getEmail(), "Bem-vindo(a) à newsletter NorteShop 🎉", html, baseUrl);
    }

    /* ── Pedidos ────────────────────────────────────────────────── */

    /** Confirmação do pedido com o estado de entrega atual e link de acompanhamento. */
    @Async
    public void sendOrderConfirmation(Order order) {
        if (order.getAddress() == null || isBlank(order.getAddress().getEmail())) {
            log.info("Email de confirmação não enviado para o pedido {} — endereço em falta", order.getId());
            return;
        }
        OrderAddress a = order.getAddress();
        String firstName = escapeHtml(a.getFullName().split(" ")[0]);

        StringBuilder items = new StringBuilder();
        for (OrderItem it : order.getItems()) {
            String line = it.getName() + (it.getVariant() != null ? " · " + it.getVariant() : "");
            items.append("""
                    <tr>
                      <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155">
                        %d × %s
                      </td>
                      <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;text-align:right">
                        %s
                      </td>
                    </tr>
                    """.formatted(it.getQty(), escapeHtml(line), formatMeticais(it.getPrice().multiply(BigDecimal.valueOf(it.getQty())))));
        }

        StringBuilder totals = new StringBuilder();
        totals.append(row("Subtotal", formatMeticais(order.getSubtotal())));
        if (order.getDiscount().signum() > 0) {
            totals.append(row("Desconto", "-" + formatMeticais(order.getDiscount())));
        }
        totals.append(row("Envio", order.getShipping().signum() == 0 ? "Grátis" : formatMeticais(order.getShipping())));
        totals.append("""
                <tr>
                  <td style="padding:8px 0;font-size:14px;font-weight:bold;color:#0f172a">TOTAL</td>
                  <td style="padding:8px 0;font-size:16px;font-weight:bold;color:#0f172a;text-align:right">%s</td>
                </tr>
                """.formatted(formatMeticais(order.getTotal())));

        String html = """
                %s
                <h2 style="margin:0 0 8px;font-size:18px">Obrigado pela sua compra, %s! 🛍️</h2>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.6">
                  O seu pedido <strong>%s</strong> foi registado em %s.
                  Estado atual: <strong style="color:#059669">%s</strong>.
                </p>
                <table style="width:100%%;border-collapse:collapse">%s</table>
                <table style="width:100%%;border-collapse:collapse;margin-top:6px">%s</table>
                <p style="margin:16px 0 0;font-size:13px;color:#334155">
                  <strong>Pagamento:</strong> %s<br>
                  <strong>Entrega para:</strong> %s · %s<br>
                  &nbsp;&nbsp;%s, %s — %s<br>
                  &nbsp;&nbsp;<span style="color:#64748b">Estimativa: %s dias úteis</span>
                </p>
                <a href="%s" style="%s">Acompanhar pedido</a>
                %s
                """.formatted(
                header(),
                firstName,
                order.getId(),
                DATE_FMT.format(order.getDate()),
                escapeHtml(order.getStatus().getLabel()),
                items,
                totals,
                escapeHtml(order.getPaymentMethod()),
                escapeHtml(a.getFullName()),
                escapeHtml(a.getPhone()),
                escapeHtml(a.getAddress()),
                escapeHtml(a.getCity() != null ? a.getCity() : ""),
                escapeHtml(a.getProvince()),
                deliveryEstimate(a.getProvince()),
                trackingUrl(order),
                buttonStyle(),
                footer());

        sendHtml(a.getEmail(), "Pedido " + order.getId() + " confirmado — NorteShop", html,
                trackingUrl(order));
    }

    /** Atualização de estado do pedido (admin avança a entrega). */
    @Async
    public void sendOrderStatusUpdate(Order order) {
        if (order.getAddress() == null || isBlank(order.getAddress().getEmail())) {
            log.info("Atualização de estado não enviada para o pedido {} — endereço em falta", order.getId());
            return;
        }
        String firstName = escapeHtml(order.getAddress().getFullName().split(" ")[0]);
        String html = """
                %s
                <h2 style="margin:0 0 8px;font-size:18px">O seu pedido avançou, %s! 📦</h2>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.6">
                  O pedido <strong>%s</strong> está agora em: <strong style="color:#059669">%s</strong>.
                </p>
                <a href="%s" style="%s">Acompanhar pedido</a>
                %s
                """.formatted(
                header(),
                firstName,
                order.getId(),
                escapeHtml(order.getStatus().getLabel()),
                trackingUrl(order),
                buttonStyle(),
                footer());

        sendHtml(order.getAddress().getEmail(),
                "Pedido " + order.getId() + " · " + order.getStatus().getLabel() + " — NorteShop",
                html, trackingUrl(order));
    }

    /* ── Envio comum ────────────────────────────────────────────── */

    /**
     * Envia via Resend; sem API key (dev) apenas faz log (com o link para testar);
     * falhas são avisadas, nunca lançadas.
     */
    private void sendHtml(String to, String subject, String html, String devHint) {
        if (isBlank(to)) {
            log.info("Email não enviado — destinatário em falta (assunto: {})", subject);
            return;
        }
        if (isBlank(apiKey)) {
            log.info("Email '{}' não enviado para {} — RESEND_API_KEY não configurada (dev). Abrir: {}",
                    subject, to, devHint);
            return;
        }
        log.info("A enviar email '{}' para {}…", subject, to);
        try {
            String response = restClient.post()
                    .uri("")
                    .header("Authorization", "Bearer " + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "from", from,
                            "to", to,
                            "subject", subject,
                            "html", html))
                    .retrieve()
                    .body(String.class);
            log.info("Email '{}' enviado para {} → {}", subject, to, response);
        } catch (Exception e) {
            log.warn("Falha ao enviar email '{}' para {}: {}", subject, to, e.getMessage());
        }
    }

    private static String header() {
        return """
                <div style="background:#1f46e6;border-radius:12px 12px 0 0;padding:24px 28px">
                  <h1 style="margin:0;color:#ffffff;font-size:20px">NorteShop</h1>
                </div>
                <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px">
                """;
    }

    private static String footer() {
        return """
                <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:14px">
                  NorteShop — Entregas para todo Moçambique · Suporte: +258 84 123 4567
                </p>
                </div>
                """;
    }

    private static String buttonStyle() {
        return "display:inline-block;background:#1f46e6;color:#ffffff;text-decoration:none;"
                + "font-weight:bold;font-size:14px;padding:12px 22px;border-radius:10px";
    }

    private static String row(String label, String value) {
        return """
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#475569">%s</td>
                  <td style="padding:6px 0;font-size:13px;color:#334155;text-align:right">%s</td>
                </tr>
                """.formatted(label, value);
    }

    private String trackingUrl(Order order) {
        return baseUrl + "/pedido/" + order.getId();
    }

    private String deliveryEstimate(String province) {
        int[] days = shippingConfig.daysFor(province);
        return days != null ? days[0] + "–" + days[1] : "a definir";
    }

    private static String formatMeticais(BigDecimal value) {
        NumberFormat nf = NumberFormat.getNumberInstance(new Locale("pt", "MZ"));
        nf.setMinimumFractionDigits(0);
        nf.setMaximumFractionDigits(2);
        return nf.format(value) + " MT";
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String escapeHtml(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
