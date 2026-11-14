package mz.norteshopmoz.api.service;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import mz.norteshopmoz.api.config.ShippingConfig;
import mz.norteshopmoz.api.domain.Coupon;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.OrderAddress;
import mz.norteshopmoz.api.domain.OrderItem;
import mz.norteshopmoz.api.domain.OrderStatus;
import mz.norteshopmoz.api.domain.Product;
import mz.norteshopmoz.api.domain.StockMovement;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.OrderRepository;
import mz.norteshopmoz.api.repository.ProductRepository;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.web.dto.OrderRequest;
import mz.norteshopmoz.api.web.dto.OrderPage;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Gestão de pedidos.
 *
 * <p>Os totais são sempre calculados no servidor a partir do catálogo — o payload do
 * cliente é apenas informativo: subtotal e desconto vêm dos preços reais dos produtos,
 * o envio da tabela de províncias (grátis acima de 5.000 MT), espelhando as regras do
 * frontend (checkout sem login — guest checkout).
 *
 * <p>Na criação:
 * <ul>
 *   <li>Valida e aplica cupões (subtrai o desconto do cupão ao subtotal calculado).</li>
 *   <li>Cobra no gateway (se o método for online) <strong>fora</strong> da
 *       transação de escrita — ver {@link #createOrder(OrderRequest, String, String)}.</li>
 *   <li>Numa transação curta: reserva o stock de cada produto (UPDATE atómico,
 *       clampado ao disponível), incrementa o contador {@code sold}, consome o
 *       cupão e grava o pedido. Uma falha nessa transação (ou no commit) reverte
 *       tudo e estorna a cobrança — o cliente nunca fica cobrado sem pedido.</li>
 * </ul>
 *
 * <p>No cancelamento:
 * <ul>
 *   <li>Apenas o dono do pedido ou um admin pode cancelar.</li>
 *   <li>Restaura o stock decrementado e ajusta o contador {@code sold}.</li>
 *   <li>Emite email de cancelamento.</li>
 * </ul>
 */
@Service
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    private static final SecureRandom RANDOM = new SecureRandom();

    /** Alfabeto do ID do pedido (alta entropia — não enumerável). */
    private static final char[] ORDER_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    private static final int ORDER_ID_LENGTH = 12;

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final EmailService emailService;
    private final ShippingConfig shippingConfig;
    private final OrderIdempotencyService idempotency;
    private final PaymentService paymentService;
    private final CouponService couponService;
    private final OrderThrottleService orderThrottle;
    /** Histórico de inventário: cada saída/entrada de stock fica registada. */
    private final StockService stockService;
    /** Canal WhatsApp (preferências notifWhatsappOrder) — best-effort, falha aberta. */
    private final WhatsAppNotificationService whatsApp;
    /**
     * Transação programática das escritas do checkout (stock + cupão + pedido).
     * O {@code createOrder} não é {@code @Transactional} porque a cobrança no
     * gateway tem de correr FORA da transação (ver o método).
     */
    private final TransactionTemplate transactions;

    public OrderService(OrderRepository orderRepository, ProductRepository productRepository,
            EmailService emailService, ShippingConfig shippingConfig,
            OrderIdempotencyService idempotency, PaymentService paymentService,
            CouponService couponService, OrderThrottleService orderThrottle,
            StockService stockService, WhatsAppNotificationService whatsApp,
            TransactionTemplate transactions) {
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.emailService = emailService;
        this.shippingConfig = shippingConfig;
        this.idempotency = idempotency;
        this.paymentService = paymentService;
        this.couponService = couponService;
        this.orderThrottle = orderThrottle;
        this.stockService = stockService;
        this.whatsApp = whatsApp;
        this.transactions = transactions;
    }

    // ── Criação ──────────────────────────────────────────────────────────────────

    /**
     * Cria um pedido (checkout).
     *
     * <p><strong>Não é {@code @Transactional} de propósito.</strong> A cobrança
     * no gateway é uma chamada externa (HTTP, em modo {@code live}) e não pode
     * correr dentro da transação de escrita: nessa versão, cada checkout online
     * segurava durante toda a latência do gateway (a) uma ligação do pool JDBC e
     * (b) o lock de escrita da linha do cupão ({@code findByCodeForUpdate},
     * aberto pelo {@code consume}). Um gateway lento esgotava o pool e derrubava
     * a API inteira — não só o checkout — e os pedidos do mesmo cupão
     * serializavam no lock.</p>
     *
     * <p>Sequência: validar/calcular (leituras) → cobrar → transação curta com
     * stock, cupão e gravação. Qualquer falha na transação (ou no commit)
     * reverte-a e estorna a cobrança em {@code catch}.</p>
     */
    public Order createOrder(OrderRequest request, String userId, String idempotencyKey) {
        // Anti duplo-submit: a mesma chave devolve o pedido já criado (ex.: retry
        // após falha de rede) em vez de criar outro. Verificado ANTES da validação
        // para o retry também passar por erros de validação transitórios.
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            Order existing = idempotency.findExisting(idempotencyKey);
            if (existing != null) {
                return existing;
            }
        }
        if (request.items() == null || request.items().isEmpty()) {
            throw ApiException.badRequest("Pedido sem itens");
        }
        if (request.address() == null) {
            throw ApiException.badRequest("Dados de entrega incompletos");
        }
        if (!shippingConfig.isValidProvince(request.address().province())) {
            throw ApiException.badRequest("Província de entrega inválida");
        }

        // Travão do checkout público: recusa ANTES de resolver o catálogo, cobrar
        // ou escrever. Só lê os contadores (as tentativas falhadas não gastam
        // quota). Ver OrderThrottleService para o porquê de ser por contacto e não
        // por IP (CGNAT das operadoras móveis).
        orderThrottle.assertAllowed(request.address().email(), request.address().phone());

        // ── Passagem ÚNICA pelo catálogo ────────────────────────────────────────
        // Antes havia TRÊS ciclos sobre `request.items()` (validação do cupão,
        // cálculo dos totais e o mapa de stock) e cada `resolveProduct` era uma
        // consulta própria — e, como `createOrder` não é `@Transactional`, cada uma
        // abria a sua transação e tirava/devolvia uma ligação ao pool. Com o limite
        // de 50 itens eram ~150 idas à base de dados por checkout, nenhuma servida
        // pela cache (a cache do catálogo é do CatalogService, não do repositório).
        // Resolver cada produto UMA vez corta isso para ~N consultas.
        Map<String, Product> resolved = new HashMap<>();
        List<OrderItem> items = new ArrayList<>();
        // Produto id → quantidade, agregado (duas linhas do mesmo produto somam).
        Map<String, Integer> toDecrement = new LinkedHashMap<>();
        BigDecimal subtotal = BigDecimal.ZERO;

        for (OrderRequest.ItemRequest item : request.items()) {
            Product product = resolveProduct(item, resolved);
            // Stock real do catálogo: esgotado → 400; quantidade acima do stock → clamp.
            int stock = product.getStock();
            if (stock <= 0) {
                throw ApiException.badRequest("Produto esgotado: " + product.getName());
            }
            int qty = Math.min(99, Math.min(Math.max(item.qty(), 1), stock));

            // `price` é o preço promocional real (o que a loja cobra). O
            // `oldPrice` é só a referência riscada no catálogo: a diferença
            // NÃO é um desconto a subtrair outra vez, porque o subtotal já
            // nasce do preço promocional. Subtraí-la duplicava o desconto
            // (produto de 1000 com riscado de 1150 era cobrado a 850).
            BigDecimal price = product.getPrice();
            subtotal = subtotal.add(price.multiply(BigDecimal.valueOf(qty)));

            String image = (product.getImages() != null && !product.getImages().isEmpty())
                    ? product.getImages().get(0)
                    : item.image();

            items.add(OrderItem.builder()
                    .productId(product.getId())
                    .slug(product.getSlug())
                    .name(product.getName())
                    .image(image)
                    .price(price)
                    .qty(qty)
                    .variant(item.variant())
                    .build());

            toDecrement.merge(product.getId(), qty, Integer::sum);
        }

        // Cupão (opcional): validado sobre o subtotal REAL (o mesmo que é cobrado,
        // com as quantidades já clampadas ao stock).
        Coupon coupon = null;
        BigDecimal couponDiscount = BigDecimal.ZERO;
        String rawCoupon = request.couponCode();
        if (rawCoupon != null && !rawCoupon.isBlank()) {
            coupon = couponService.validate(rawCoupon, subtotal);
            couponDiscount = couponService.calculate(coupon, subtotal);
        }

        String paymentMethod = request.paymentMethod() == null
                ? ""
                : request.paymentMethod().trim();
        if (paymentMethod.isEmpty()) {
            throw ApiException.badRequest("Escolha um método de pagamento.");
        }
        // Resolve o método (rótulo ou alias) — desconhecido/removido → 400.
        // Métodos pagos online (M-Pesa/e-Mola/mKesh/cartão) são cobrados no
        // gateway (simulado em dev).
        // A cobrança acontece mais abaixo, FORA da transação de escrita, só depois
        // de reservar a chave de idempotência (ver a ordem das operações).
        PaymentService.PaymentMethodInfo method = paymentService.resolve(paymentMethod)
                .orElseThrow(() -> ApiException.badRequest("Método de pagamento indisponível: " + paymentMethod));

        BigDecimal shipping = subtotal.compareTo(ShippingConfig.FREE_SHIPPING_THRESHOLD) >= 0
                ? BigDecimal.ZERO
                : shippingConfig.feeFor(request.address().province());
        // O único desconto que mexe no total é o cupão — o subtotal já usa os
        // preços promocionais. Clamp a zero como o frontend.
        BigDecimal total = subtotal.subtract(couponDiscount).max(BigDecimal.ZERO).add(shipping);

        // ── Ordem das operações (importante) ────────────────────────────────────
        // 1) validar/calcular (só leituras)  2) cobrar  3) transação curta.
        //
        // A validação acima já rejeita os casos óbvios (produto esgotado, cupão
        // inválido ou com o limite de usos atingido), pelo que a cobrança só
        // acontece para pedidos que passariam. A transação de escrita fica curta
        // e sem chamadas externas lá dentro.
        // Total recalculado no servidor — o valor a cobrar no gateway (o total do
        // payload do cliente é informativo e nunca é usado para cobrar).
        final BigDecimal chargeAmount = total;
        final boolean hasIdempotencyKey = idempotencyKey != null && !idempotencyKey.isBlank();
        // O id do pedido é gerado ANTES da cobrança: é a referência enviada ao
        // provedor de pagamento (única e estável), pelo que o pagamento fica ligado
        // ao pedido já desde a criação — e o webhook de confirmação consegue
        // encontrá-lo mesmo que a transação de escrita falhe a seguir.

        // ── Exclusão atómica antes de cobrar ────────────────────────────────────
        // A verificação no início é apenas uma leitura: entre ela e a gravação,
        // dois pedidos com a mesma Idempotency-Key (duplo clique, retry) passavam
        // ambos e cobravam duas vezes. A reserva SET NX fecha essa janela: quem
        // não a obtém não toca no gateway. Se a reserva for de um pedido já
        // concluído, devolve-se esse pedido; se ainda estiver em curso (outra
        // tentativa a cobrar), responde-se 409 sem cobrar — o cliente reenvia e
        // recebe o pedido que entretanto ficou concluído.
        if (hasIdempotencyKey && !idempotency.reserve(idempotencyKey)) {
            Order concurrent = idempotency.findExisting(idempotencyKey);
            if (concurrent != null) {
                return concurrent;
            }
            throw ApiException.conflict(
                    "Já existe um pedido a ser processado para esta tentativa. Aguarde alguns "
                            + "instantes e verifique os seus pedidos antes de tentar novamente.");
        }

        final String orderId = "NSM-" + newOrderId();
        PaymentGateway.PaymentCharge charge;
        try {
            // Defensivo: um gateway pode não devolver cobrança; nesse caso o pedido
            // fica à espera do link que o admin cola no painel.
            charge = paymentService.authorize(method, orderId, request.paymentInfo(), chargeAmount);
        } catch (RuntimeException e) {
            // A cobrança não chegou a acontecer (ou foi rejeitada): liberta a
            // reserva para o cliente poder tentar de novo com a mesma chave.
            if (hasIdempotencyKey) {
                idempotency.release(idempotencyKey);
            }
            throw e;
        }

        // Cobrança aceite: um método pago online NUNCA nasce confirmado — só o
        // provedor (webhook assinado) pode dizer que o dinheiro entrou. O pedido
        // fica em "Aguarda pagamento" com o link do gateway quando ele o devolve;
        // sem link (gateway em baixo, ou modo simulado), fica à espera do link
        // que o admin cola no painel — e é avisado para isso.
        final String paymentReference = charge == null ? null : charge.reference();
        final String checkoutUrl = charge == null ? null : charge.checkoutUrl();

        // Cópias finais: as variáveis de cálculo são mutadas nos ciclos acima e
        // por isso não servem num lambda.
        final Coupon appliedCoupon = coupon;
        final List<OrderItem> persistedItems = List.copyOf(items);
        final Map<String, Integer> stockReservation = new LinkedHashMap<>(toDecrement);
        final BigDecimal orderSubtotal = subtotal;
        final BigDecimal orderShipping = shipping;
        final BigDecimal orderDiscount = couponDiscount;
        final BigDecimal orderTotal = chargeAmount;

        try {
            return transactions.execute(status -> {
                // Reserva atómica do stock (0 linhas = esgotou entretanto → 400)
                // e consumo do cupão (row lock, mantido só durante esta
                // transação — e não durante a chamada ao gateway).
                decrementStockAndSold(stockReservation, orderId);
                if (appliedCoupon != null) {
                    couponService.consume(appliedCoupon.getCode());
                }

                Order order = Order.builder()
                        .id(orderId)
                        .date(Instant.now())
                        .userId(userId)
                        .items(persistedItems)
                        .subtotal(orderSubtotal)
                        .shipping(orderShipping)
                        .discount(orderDiscount)
                        .total(orderTotal)
                        // Pago online → "Aguarda pagamento" (só o webhook confirma).
                        .status(OrderStatus.AGUARDA_PAGAMENTO)
                        .address(toAddress(request.address()))
                        .paymentMethod(method.label())
                        .paymentReference(paymentReference)
                        .checkoutUrl(checkoutUrl)
                        .couponCode(appliedCoupon != null ? appliedCoupon.getCode() : null)
                        .build();

                Order saved = orderRepository.save(order);
                // checkoutUrl é persistido (V12) — o merge() copia-o para a
                // instância gerida: o link fica disponível na resposta, no email
                // e na página de acompanhamento do pedido.
                // Email de confirmação SÓ DEPOIS DO COMMIT: era enviado dentro da
                // transação, antes do commit — se o commit falhasse a seguir, o
                // cliente recebia "compra confirmada" de um pedido que não existe.
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        // Só agora a chave passa a apontar para o pedido: se o
                        // commit tivesse falhado, o `catch` libertava a reserva
                        // (que continua PENDING) e o cliente podia tentar de novo —
                        // em vez de ficar 24h com uma chave a apontar para um
                        // pedido inexistente.
                        idempotency.complete(idempotencyKey, saved);
                        emailService.sendOrderConfirmation(saved);
                        whatsApp.sendOrderConfirmation(saved);
                        // Pedido online sem link do gateway: o admin tem de o
                        // colar no painel. Avisá-lo AGORA, não quando o cliente
                        // reclamar — o stock está reservado e o prazo corre.
                        if (saved.getStatus() == OrderStatus.AGUARDA_PAGAMENTO
                                && (saved.getCheckoutUrl() == null || saved.getCheckoutUrl().isBlank())) {
                            emailService.sendPaymentLinkRequest(saved);
                            whatsApp.sendPaymentLinkRequestToAdmin(saved);
                        }
                        // Quota do travão do checkout: só conta pedidos que
                        // existem MESMO (após commit) — ver OrderThrottleService.
                        orderThrottle.recordCreated(saved.getAddress().getEmail(),
                                saved.getAddress().getPhone());
                    }
                });
                return saved;
            });
        } catch (RuntimeException e) {
            // Compensação: a transação já reverteu (stock e cupão voltam ao
            // estado anterior) e falta devolver o dinheiro. Sem referência de
            // cobrança não há nada a estornar. A reserva de idempotência
            // é libertada para o cliente poder repetir a compra. Um estorno que
            // falhe abre uma incidência (REFUND_FAILED) na fila de reconciliação.
            if (hasIdempotencyKey) {
                idempotency.release(idempotencyKey);
            }
            if (paymentReference != null) {
                paymentService.refund(paymentReference, chargeAmount, orderId);
            }
            throw e;
        }
    }

    /**
     * Decrementa stock e incrementa o contador "mais vendidos" por produto.
     *
     * <p>Usa um UPDATE condicional atómico no repositório: dois checkouts
     * concorrentes da última unidade são serializados pela base de dados — o
     * primeiro decrementa, o segundo afecta 0 linhas e o pedido falha com 400
     * em vez de vender a mesma unidade duas vezes (oversell). Um simples lock de
     * leitura não chegava: o Hibernate devolvia a entidade já carregada no
     * contexto de persistência, com o stock obsoleto.</p>
     */
    private void decrementStockAndSold(Map<String, Integer> toDecrement, String orderId) {
        for (Map.Entry<String, Integer> e : toDecrement.entrySet()) {
            String productId = e.getKey();
            int qty = e.getValue();
            int updated = productRepository.decrementStockAndSold(productId, qty);
            if (updated == 0) {
                // Produto inexistente ou sem stock suficiente (outro pedido
                // esgotou-o entretanto) — não se cria um pedido por satisfazer.
                String name = productRepository.findById(productId)
                        .map(Product::getName).orElse(productId);
                throw ApiException.badRequest("Stock insuficiente para " + name
                        + " — o produto esgotou ou já não está disponível.");
            }
            // Histórico de inventário (mesma transação: reverter o pedido reverte
            // o movimento).
            stockService.recordAutomatic(productId, -qty,
                    StockMovement.REASON_CHECKOUT, "Pedido " + orderId);
        }
    }

    /** ID aleatório de 12 caracteres (32^12 ≈ 2^60 — colisões negligenciáveis). */
    private static String newOrderId() {
        StringBuilder sb = new StringBuilder(ORDER_ID_LENGTH);
        for (int i = 0; i < ORDER_ID_LENGTH; i++) {
            sb.append(ORDER_ID_ALPHABET[RANDOM.nextInt(ORDER_ID_ALPHABET.length)]);
        }
        return sb.toString();
    }

    /**
     * Resolve o produto pelo id (ou slug) do catálogo — falha se não existir.
     *
     * @param cache produtos já resolvidos nesta chamada (evita repetir a consulta
     *              quando o carrinho tem o mesmo produto em duas linhas, ex.:
     *              variantes diferentes)
     */
    private Product resolveProduct(OrderRequest.ItemRequest item, Map<String, Product> cache) {
        if (item.productId() != null) {
            Product cached = cache.get("id:" + item.productId());
            if (cached != null) {
                return cached;
            }
            Product product = productRepository.findById(item.productId()).orElse(null);
            if (product != null) {
                cache.put("id:" + item.productId(), product);
                return product;
            }
        }
        if (item.slug() != null) {
            Product cached = cache.get("slug:" + item.slug());
            if (cached != null) {
                return cached;
            }
            Product product = productRepository.findBySlug(item.slug()).orElse(null);
            if (product != null) {
                cache.put("slug:" + item.slug(), product);
                return product;
            }
        }
        throw ApiException.badRequest("Produto não encontrado no catálogo: " + item.name());
    }

    // ── Cancelamento ─────────────────────────────────────────────────────────────

    /**
     * Cancela um pedido existente (só o dono ou admin).
     * Restaura o stock e ajusta o contador sold, e envia email de cancelamento.
     *
     * <p>Só pode ser cancelado enquanto não estiver entregue ou já cancelado.
     */
    @Transactional
    public Order cancelOrder(String id, UserPrincipal principal) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Pedido não encontrado"));

        boolean admin = principal != null && "ADMIN".equalsIgnoreCase(principal.role());
        if (!admin && order.getUserId() == null) {
            throw ApiException.forbidden("Não tem permissões para cancelar este pedido");
        }
        if (!admin && !order.getUserId().equals(principal.id())) {
            throw ApiException.forbidden("Só pode cancelar os seus próprios pedidos");
        }

        return applyCancellation(order);
    }

    /**
     * Cancela o pedido: marca o estado, repõe stock/vendas dos itens e envia o
     * email de cancelamento. Assume que as validações de estado já foram feitas.
     */
    private Order applyCancellation(Order order) {
        OrderStatus current = order.getStatus();
        if (current == OrderStatus.CANCELADO) {
            throw ApiException.badRequest("Este pedido já foi cancelado");
        }
        if (current == OrderStatus.ENTREGUE) {
            throw ApiException.badRequest("Não é possível cancelar um pedido já entregue");
        }

        // Agrupa os itens ANTES da transição — a atualização em massa limpa o
        // contexto de persistência.
        Map<String, Integer> toRestore = new LinkedHashMap<>();
        for (OrderItem item : order.getItems()) {
            toRestore.merge(item.getProductId(), item.getQty(), Integer::sum);
        }

        // Transição ATÓMICA para CANCELADO. Só a chamada que efetivamente afeta a
        // linha repõe o stock — sem isto, dois cancelamentos simultâneos (dono +
        // admin, ou duplo clique) passavam ambos pela verificação de estado acima
        // e repunham o stock DUAS vezes, inflando o inventário (oversell futuro).
        if (orderRepository.markCancelled(order.getId(), OrderStatus.CANCELADO, OrderStatus.ENTREGUE) == 0) {
            throw ApiException.badRequest("Este pedido já foi cancelado");
        }
        order.setStatus(OrderStatus.CANCELADO);
        Order cancelled = order;

        restoreStockAndSold(toRestore, order.getId());

        // Email SÓ após commit — um rollback a seguir não pode anunciar um
        // cancelamento que não aconteceu.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                emailService.sendOrderCancellation(cancelled);
                whatsApp.sendOrderStatusUpdate(cancelled);
            }
        });
        return cancelled;
    }

    /**
     * Restaura stock e vendas depois de um cancelamento (agrupa por produto).
     * Usa o UPDATE atómico do repositório: repor em paralelo com um checkout
     * nunca perde uma das atualizações.
     */
    private void restoreStockAndSold(Map<String, Integer> toRestore, String orderId) {
        for (Map.Entry<String, Integer> e : toRestore.entrySet()) {
            productRepository.restoreStockAndSold(e.getKey(), e.getValue());
            // Histórico: a reposição é um movimento de entrada (mesma transação).
            stockService.recordAutomatic(e.getKey(), e.getValue(),
                    StockMovement.REASON_CANCELLATION,
                    orderId == null ? null : "Cancelamento do pedido " + orderId);
        }
    }

    // ── Transição de estado (admin) ───────────────────────────────────────────────

    /**
     * Atualiza o estado de um pedido (admin) — apenas transições para a frente
     * na timeline dos estados; recuar ou um estado inválido → 400.
     */
    @Transactional
    public Order updateStatus(String id, String statusLabel) {
        return updateStatus(id, statusLabel, null);
    }

    /**
     * Atualiza o estado e, opcionalmente, o código de tracking do envio.
     * O tracking é definido tipicamente quando o pedido avança para
     * "Enviado"/"Em trânsito" (número da transportadora) e passa a aparecer na
     * página de acompanhamento do cliente.
     *
     * @param trackingCode novo código (null/vazio = manter o atual; prefixo
     *                     {@code "-"} = limpar — útil para corrigir um erro)
     */
    @Transactional
    public Order updateStatus(String id, String statusLabel, String trackingCode) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Pedido não encontrado"));
        OrderStatus next = OrderStatus.fromLabel(statusLabel)
                .orElseThrow(() -> ApiException.badRequest("Estado inválido: " + statusLabel));
        if (next.ordinal() < order.getStatus().ordinal()) {
            throw ApiException.badRequest("Transição inválida: não é possível recuar de "
                    + order.getStatus().getLabel() + " para " + next.getLabel());
        }
        // Cancelar por aqui tem de repor o stock — igual ao DELETE /api/orders/{id}.
        // Sem isto, o stock decrementado na criação ficava perdido para sempre.
        if (next == OrderStatus.CANCELADO) {
            return applyCancellation(order);
        }
        order.setStatus(next);
        if (trackingCode != null) {
            String trimmed = trackingCode.trim();
            if (trimmed.equals("-")) {
                order.setTrackingCode(null); // "-" limpa explicitamente (correção de erro)
            } else if (!trimmed.isEmpty()) {
                order.setTrackingCode(trimmed.length() > 80 ? trimmed.substring(0, 80) : trimmed);
            }
            // vazio = não altera (o frontend só envia o campo quando o preenche)
        }
        Order updated = orderRepository.save(order);
        // Email de atualização do estado (assíncrono e só após commit) + WhatsApp
        // quando o cliente tem a preferência ligada.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                emailService.sendOrderStatusUpdate(updated);
                whatsApp.sendOrderStatusUpdate(updated);
            }
        });
        return updated;
    }

    // ── Expiração de pagamentos abandonados ──────────────────────────────────────

    /**
     * Cancela os pedidos em "Aguarda pagamento" criados antes do corte e repõe o
     * stock — o carrinho do checkout é pago fora da loja (PaySuite/página do
     * provedor) e um cliente que desista deixa o stock reservado para sempre se
     * ninguém cancelar. Corre agendado ({@code AbandonedOrderCleanup},
     * {@code app.orders.payment-expiry-minutes}, 24 h por omissão; 0 = desligado).
     *
     * <p>O {@code applyCancellation} faz tudo o que um cancelamento manual faz:
     * transição atómica ({@code markCancelled} — imune a corridas com um cliente
     * que pague no último minuto), reposição de stock e email de cancelamento.
     * Falhas isoladas não abortam o lote (um pedido estranho não bloqueia os
     * restantes).</p>
     *
     * @return número de pedidos expirados e cancelados
     */
    @Transactional
    public int expireStaleAwaitingPayment(Instant cutoff) {
        List<Order> stale = orderRepository.findByStatusAndDateBefore(
                OrderStatus.AGUARDA_PAGAMENTO, cutoff);
        int expired = 0;
        for (Order order : stale) {
            try {
                applyCancellation(order);
                expired++;
            } catch (RuntimeException e) {
                // Já cancelado/entregue entretanto, ou erro pontual: segue o lote.
                log.warn("Expiração: não foi possível cancelar o pedido {} — {}",
                        order.getId(), e.getMessage());
            }
        }
        return expired;
    }

    /**
     * Admin cola o link de pagamento de um pedido em «Aguarda pagamento».
     *
     * <p>Serve o caso em que o gateway não devolveu link no checkout (ou o
     * pedido foi criado sem gateway). Ao gravar, o cliente é avisado por email
     * e WhatsApp — e a página de acompanhamento passa a mostrar «Pagar agora».
     * É o ÚNICO caminho para um link: o cliente não gera o seu próprio (cobranças
     * novas sem supervisão criariam pagamentos duplicados).</p>
     */
    @Transactional
    public Order setPaymentLinkByAdmin(String id, String url) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Pedido não encontrado"));
        if (order.getStatus() != OrderStatus.AGUARDA_PAGAMENTO) {
            throw ApiException.badRequest("Este pedido não está à espera de pagamento (estado: "
                    + order.getStatus().getLabel() + ")");
        }
        String link = url == null ? "" : url.trim();
        if (link.isEmpty() || link.length() > 500
                || !(link.startsWith("https://") || link.startsWith("http://"))) {
            throw ApiException.badRequest("Link de pagamento inválido — use um URL http(s) até 500 caracteres.");
        }
        order.setCheckoutUrl(link);
        Order saved = orderRepository.save(order);
        log.info("Link de pagamento definido manualmente para o pedido {}", order.getId());
        // Notificação só DEPOIS DO COMMIT: um rollback nunca pode ter avisado o cliente.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                emailService.sendPaymentLinkReady(saved);
                whatsApp.sendPaymentLinkReady(saved);
            }
        });
        return saved;
    }

    // ── Mapeamento de endereço ───────────────────────────────────────────────────

    private OrderAddress toAddress(OrderRequest.AddressRequest a) {
        return OrderAddress.builder()
                .fullName(a.fullName())
                .phone(a.phone())
                .email(a.email())
                .address(a.address())
                .city(a.city())
                .province(a.province())
                .notes(a.notes())
                .build();
    }
}
