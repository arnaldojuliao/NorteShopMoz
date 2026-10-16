package mz.norteshopmoz.api.service;

import java.util.LinkedHashMap;
import java.util.Map;
import mz.norteshopmoz.api.domain.PaymentIncident;
import mz.norteshopmoz.api.repository.PaymentIncidentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Fila de reconciliação de pagamentos — incidências que exigem decisão humana.
 *
 * <p>Dois casos alimentam esta fila:</p>
 * <ol>
 *   <li><strong>WEBHOOK_FAILED</strong> — a PaySuite notifica {@code payment.failed}:
 *       o cliente não concluiu o pagamento. O pedido <em>não</em> é cancelado
 *       automaticamente (pode ser um falso negativo do provedor); fica um caso
 *       aberto para a operação decidir no painel.</li>
 *   <li><strong>REFUND_FAILED</strong> — um estorno falhou (gateway em baixo,
 *       pagamento já concluído que a PaySuite recusa devolver). Antes ficava
 *       só no log: o cliente pagou e ninguém sabia que faltava devolver.</li>
 * </ol>
 *
 * <p><strong>Propagação REQUIRES_NEW</strong>: quem grava a incidência está
 * muitas vezes a caminhar para um rollback (estorno após falha do commit, por
 * exemplo). Se a incidência fosse gravada na mesma transação, o rollback a
 * apagaria — precisamente o cenário em que ela interessa. Em testes unitários
 * sem transação ativa, REQUIRES_NEW comporta-se como uma transação normal.</p>
 */
@Service
public class PaymentIncidentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentIncidentService.class);

    private final PaymentIncidentRepository repository;

    public PaymentIncidentService(PaymentIncidentRepository repository) {
        this.repository = repository;
    }

    /**
     * Registra uma incidência aberta. Nunca lança: quem a chama está no caminho
     * de erro — a falha de registar a incidência não pode mascarar a exceção
     * original. Idempotente por (pedido, tipo): repetir a mesma falha não
     * empilha casos iguais.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String orderId, String paymentReference, String incidentType, String detail) {
        try {
            if (orderId == null || orderId.isBlank()) {
                return;
            }
            if (repository.existsByOrderIdAndIncidentTypeAndStatus(orderId, incidentType, "ABERTA")) {
                log.info("Incidência {} já aberta para o pedido {} — não duplica", incidentType, orderId);
                return;
            }
            repository.save(PaymentIncident.builder()
                    .orderId(orderId)
                    .paymentReference(paymentReference)
                    .incidentType(incidentType)
                    .detail(detail)
                    .status("ABERTA")
                    .build());
            log.warn("Incidência de pagamento registada ({}) para o pedido {}", incidentType, orderId);
        } catch (RuntimeException e) {
            log.error("Falha ao registar incidência de pagamento (pedido {})", orderId, e);
        }
    }

    @Transactional(readOnly = true)
    public Map<String, Object> list(String status) {
        var incidents = status == null || status.isBlank()
                ? repository.findAllByOrderByCreatedAtDesc()
                : repository.findByStatusOrderByCreatedAtDesc(status.trim().toUpperCase());
        return new LinkedHashMap<>(Map.of("incidents", incidents));
    }

    /** Marca o caso como resolvido (a operação tratou no painel do provedor). */
    @Transactional
    public PaymentIncident resolve(Long id, String adminId) {
        PaymentIncident incident = repository.findById(id)
                .orElseThrow(() -> mz.norteshopmoz.api.exception.ApiException.notFound("Incidência não encontrada"));
        incident.setStatus("RESOLVIDA");
        incident.setResolvedAt(java.time.Instant.now());
        incident.setResolvedBy(adminId);
        return repository.save(incident);
    }
}
