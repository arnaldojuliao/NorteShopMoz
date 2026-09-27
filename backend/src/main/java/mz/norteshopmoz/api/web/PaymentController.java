package mz.norteshopmoz.api.web;

import java.util.Map;
import mz.norteshopmoz.api.service.PaymentService;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Métodos de pagamento disponíveis — GET /api/payments/methods (público).
 *
 * <p>O checkout consulta isto para desativar no UI os métodos que o servidor não
 * consegue cobrar: em produção sem gateway real, M-Pesa/e-Mola/cartão devolviam
 * 503 só no fim do checkout — o cliente escolhia, preenchia tudo e via o pedido
 * falhar. Com este endpoint, o frontend esconde os métodos indisponíveis antes
 * de o cliente os escolher.</p>
 */
@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @GetMapping("/methods")
    public ResponseEntity<?> methods() {
        return ResponseEntity.ok(ApiResponse.data(Map.of(
                "methods", paymentService.currentlyAvailableLabels(),
                "onlinePaymentsAvailable", paymentService.onlinePaymentsAvailable())));
    }
}
