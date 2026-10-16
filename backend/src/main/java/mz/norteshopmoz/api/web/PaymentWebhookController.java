package mz.norteshopmoz.api.web;

import java.util.Map;
import mz.norteshopmoz.api.service.PaymentWebhookService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Notificações do gateway de pagamento (webhook).
 *
 * <p><strong>Público, de propósito</strong>: o provedor de pagamentos não tem
 * sessão na loja. A autenticação é a assinatura HMAC do corpo
 * ({@code X-Signature}, como a PaySuite a envia; aceita-se também o antigo
 * {@code X-NSM-Signature}), verificada em {@link PaymentWebhookService} — sem
 * ela, qualquer pessoa que descobrisse o URL poderia confirmar pagamentos que
 * nunca aconteceram. Sem {@code PAYMENTS_WEBHOOK_SECRET} configurado, o
 * endpoint responde 503 em vez de aceitar notificações não assinadas.</p>
 *
 * <p>Responde 200 com o id do pedido quando a notificação é válida, para o
 * gateway parar de repetir. Erros: 401 (assinatura inválida), 400 (corpo
 * inválido), 404 (referência desconhecida), 503 (webhook não configurado).</p>
 *
 * <p>Nota: o corpo é recebido como <strong>String cru</strong> e não como DTO.
 * A assinatura é calculada sobre os bytes exatos enviados — desserializar e
 * reserializar (mudança de espaços ou de ordem dos campos) invalidaria um HMAC
 * correto.</p>
 */
@RestController
@RequestMapping("/api/payments")
public class PaymentWebhookController {

    private final PaymentWebhookService webhookService;

    public PaymentWebhookController(PaymentWebhookService webhookService) {
        this.webhookService = webhookService;
    }

    /** POST /api/payments/webhook — confirmação assíncrona do gateway. */
    @PostMapping("/webhook")
    public ResponseEntity<?> webhook(
            @RequestBody(required = false) String rawBody,
            @RequestHeader(value = "X-Signature", required = false) String signature,
            @RequestHeader(value = "X-NSM-Signature", required = false) String legacySignature) {
        String orderId = webhookService.handle(rawBody,
                signature != null ? signature : legacySignature);
        return ResponseEntity.ok(ApiResponse.data(Map.of("orderId", orderId)));
    }
}
