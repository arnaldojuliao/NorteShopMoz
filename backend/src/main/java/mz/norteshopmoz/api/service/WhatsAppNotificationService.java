package mz.norteshopmoz.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import mz.norteshopmoz.api.config.AppProperties;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.OrderStatus;
import mz.norteshopmoz.api.domain.UserAccount;
import mz.norteshopmoz.api.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Notificações WhatsApp — o consumidor que faltava das preferências
 * {@code notifWhatsapp*}.
 *
 * <p>Os toggles existiam em {@code /configuracoes} e eram gravados na conta,
 * mas nada os lia: o cliente ligava "atualizações por WhatsApp" e não recebia
 * nada. Este serviço envia as atualizações de estado do pedido (e a confirmação
 * de criação) para o provedor configurado em {@code app.whatsapp.api-url}
 * (qualquer endpoint {@code POST {to, message}} com Bearer opcional —
 * Confirme.io, adaptador próprio, etc.).</p>
 *
 * <h2>Quem recebe</h2>
 *
 * <p>Só contas registadas com {@code notifWhatsappOrder=true} e telefone na
 * conta. Pedidos de convidado <strong>não</strong> recebem WhatsApp — nunca houve
 * consentimento (o telefone da morada é para o entregador, não é um opt-in de
 * marketing/mensagens). O email continua a ser o canal garantido de todos.</p>
 *
 * <h2>Falha aberta</h2>
 *
 * <p>Igual ao email: uma falha do WhatsApp (provedor em baixo, cota esgotada)
 * é logada e ignorada — nunca atrasa o pedido nem substitui o email. Sem
 * {@code api-url} configurada, o serviço loga em DEBUG (modo dev) e sai.</p>
 */
@Service
public class WhatsAppNotificationService {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppNotificationService.class);

    /** Timeout do POST ao provedor — mensagens são best-effort. */
    private static final Duration SEND_TIMEOUT = Duration.ofSeconds(5);

    private final UserRepository userRepository;
    private final String apiUrl;
    private final String apiToken;
    private final String storeBaseUrl;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient http;

    public WhatsAppNotificationService(UserRepository userRepository, AppProperties props) {
        this.userRepository = userRepository;
        AppProperties.Whatsapp cfg = props == null ? null : props.whatsapp();
        this.apiUrl = cfg == null || cfg.apiUrl() == null || cfg.apiUrl().isBlank()
                ? null : cfg.apiUrl().trim();
        this.apiToken = cfg == null || cfg.apiToken() == null || cfg.apiToken().isBlank()
                ? null : cfg.apiToken().trim();
        // Base dos links de acompanhamento (a mesma que o email usa nos seus links).
        String mailBase = props != null && props.mail() != null && props.mail().baseUrl() != null
                && !props.mail().baseUrl().isBlank()
                        ? props.mail().baseUrl().replaceAll("/+$", "") : "";
        this.storeBaseUrl = mailBase;
        this.http = HttpClient.newBuilder()
                .connectTimeout(SEND_TIMEOUT)
                .build();
        if (apiUrl == null) {
            log.info("Canal WhatsApp desligado (WHATSAPP_API_URL vazio) — preferências guardadas, sem envio");
        }
    }

    /** true quando o provedor está configurado (o frontend pode usar para mostrar o canal como ativo). */
    public boolean enabled() {
        return apiUrl != null;
    }

    /**
     * Envia a atualização de estado de um pedido (best-effort, assíncrono).
     * Chamado após o commit — um rollback nunca pode ter notificado o cliente.
     */
    public void sendOrderStatusUpdate(Order order) {
        if (order == null) {
            return;
        }
        String message = "Pedido " + order.getId() + ": " + statusLabel(order)
                + (order.getTrackingCode() == null ? "" : " — tracking " + order.getTrackingCode())
                + ". Acompanhe em " + storeBaseUrl() + "/pedido/" + order.getId();
        sendToOrderCustomer(order, message);
    }

    /** Confirmação de criação do pedido (mesma política do email: após commit). */
    public void sendOrderConfirmation(Order order) {
        if (order == null) {
            return;
        }
        String message = "Recebemos o seu pedido " + order.getId() + " (total "
                + order.getTotal() + " MT). Estado: " + statusLabel(order)
                + ". Acompanhe em " + storeBaseUrl() + "/pedido/" + order.getId();
        sendToOrderCustomer(order, message);
    }

    private void sendToOrderCustomer(Order order, String message) {
        if (apiUrl == null || order.getUserId() == null || order.getUserId().isBlank()) {
            return; // desligado, ou pedido de convidado (sem preferências conhecidas)
        }
        try {
            Optional<UserAccount> user = userRepository.findById(order.getUserId());
            if (user.isEmpty() || !user.get().isNotifWhatsappOrder()) {
                return;
            }
            String phone = normalizePhone(user.get().getPhone());
            if (phone == null) {
                log.debug("Sem telefone na conta {} — WhatsApp ignorado", order.getUserId());
                return;
            }
            send(phone, message);
        } catch (RuntimeException e) {
            log.warn("Falha ao preparar WhatsApp do pedido {} (ignorado)", order.getId(), e);
        }
    }

    /** POST assíncrono {to, message} — o resultado só interessa ao log. */
    private void send(String to, String message) {
        try {
            Map<String, String> payload = new LinkedHashMap<>();
            payload.put("to", to);
            payload.put("message", message);
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(apiUrl))
                    .timeout(SEND_TIMEOUT)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)));
            if (apiToken != null) {
                builder.header("Authorization", "Bearer " + apiToken);
            }
            http.sendAsync(builder.build(), HttpResponse.BodyHandlers.ofString())
                    .whenComplete((response, error) -> {
                        if (error != null) {
                            log.warn("Envio WhatsApp falhou (ignorado): {}", error.toString());
                        } else if (response.statusCode() >= 300) {
                            log.warn("Envio WhatsApp recusado pelo provedor: HTTP {} (ignorado)",
                                    response.statusCode());
                        } else {
                            log.info("WhatsApp enviado para {}…", to.substring(0, Math.min(6, to.length())));
                        }
                    });
        } catch (Exception e) {
            log.warn("Envio WhatsApp falhou (ignorado)", e);
        }
    }

    /** Rótulo do estado (o mesmo que o frontend mostra). */
    private static String statusLabel(Order order) {
        OrderStatus status = order.getStatus();
        return status == null ? "" : status.getLabel();
    }

    private String storeBaseUrl() {
        return storeBaseUrl;
    }

    /** Só dígitos; null se não parecer um número de telefone. */
    private static String normalizePhone(String phone) {
        if (phone == null || phone.isBlank()) {
            return null;
        }
        String digits = phone.replaceAll("[^0-9]", "");
        return digits.length() >= 9 ? digits : null;
    }
}
