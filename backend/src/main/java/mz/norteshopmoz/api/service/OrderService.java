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
            TransactionTemplate transactions) {
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.emailService = emailService;
        this.shippingConfig = shippingConfig;
        this.idempotency = idempotency;
        this.paymentService = paymentService;
        this.couponService = couponService;
        this.orderThrottle = orderThrottle;
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
        BigDecimal priceDiscount = BigDecimal.ZERO;

        for (OrderRequest.ItemRequest item : request.items()) {
            Product product = resolveProduct(item, resolved);
            // Stock real do catálogo: esgotado → 400; quantidade acima do stock → clamp.
            int stock = product.getStock();
            if (stock <= 0) {
                throw ApiException.badRequest("Produto esgotado: " + product.getName());
            }
            int qty = Math.min(99, Math.min(Math.max(item.qty(), 1), stock));

            BigDecimal price = product.getPrice();
            subtotal = subtotal.add(price.multiply(BigDecimal.valueOf(qty)));

            BigDecimal oldPrice = product.getOldPrice();
            if (oldPrice != null && oldPrice.compareTo(price) > 0) {
                priceDiscount = priceDiscount.add(oldPrice.subtract(price).multiply(BigDecimal.valueOf(qty)));
            }

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
                ? "Pagamento na entrega"
                : request.paymentMethod().trim();
        // Resolve o método (rótulo ou alias) — desconhecido → 400. Métodos pagos
        // online (M-Pesa/e-Mola/cartão) são cobrados no gateway (simulado em dev).
        // A cobrança acontece mais abaixo, FORA da transação de escrita, só depois
        // de reservar a chave de idempotência (ver a ordem das operações).
        PaymentService.PaymentMethodInfo method = paymentService.resolve(paymentMethod)
                .orElseThrow(() -> ApiException.badRequest("Método de pagamento indisponível: " + paymentMethod));

        BigDecimal shipping = subtotal.compareTo(ShippingConfig.FREE_SHIPPING_THRESHOLD) >= 0
                ? BigDecimal.ZERO
                : shippingConfig.feeFor(request.address().province());
        // Clamp a zero como o frontend (Math.max(0, subtotal − desconto) + envio)
        BigDecimal total = subtotal.subtract(priceDiscount).subtract(couponDiscount)
                .max(BigDecimal.ZERO).add(shipping);

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

        String paymentReference;
        try {
            paymentReference = paymentService.authorize(method, request.paymentInfo(), chargeAmount);
        } catch (RuntimeException e) {
            // A cobrança não chegou a acontecer (ou foi rejeitada): liberta a
            // reserva para o cliente poder tentar de novo com a mesma chave.
            if (hasIdempotencyKey) {
                idempotency.release(idempotencyKey);
            }
            throw e;
        }

        // Cópias finais: as variáveis de cálculo são mutadas nos ciclos acima e
        // por isso não servem num lambda.
        final Coupon appliedCoupon = coupon;
        final List<OrderItem> persistedItems = List.copyOf(items);
        final Map<String, Integer> stockReservation = new LinkedHashMap<>(toDecrement);
        final BigDecimal orderSubtotal = subtotal;
        final BigDecimal orderShipping = shipping;
        final BigDecimal orderDiscount = priceDiscount.add(couponDiscount);
        final BigDecimal orderTotal = chargeAmount;

        try {
            return transactions.execute(status -> {
                // Reserva atómica do stock (0 linhas = esgotou entretanto → 400)
                // e consumo do cupão (row lock, mantido só durante esta
                // transação — e não durante a chamada ao gateway).
                decrementStockAndSold(stockReservation);
                if (appliedCoupon != null) {
                    couponService.consume(appliedCoupon.getCode());
                }

                Order order = Order.builder()
                        .id("NSM-" + newOrderId())
                        .date(Instant.now())
                        .userId(userId)
                        .items(persistedItems)
                        .subtotal(orderSubtotal)
                        .shipping(orderShipping)
                        .discount(orderDiscount)
                        .total(orderTotal)
                        // Pagos online no checkout já entram com pagamento confirmado.
                        .status(method.paidOnline() ? OrderStatus.PAGAMENTO_CONFIRMADO : OrderStatus.PEDIDO_RECEBIDO)
                        .address(toAddress(request.address()))
                        .paymentMethod(method.label())
                        .paymentReference(paymentReference)
                        .couponCode(appliedCoupon != null ? appliedCoupon.getCode() : null)
                        .build();

                Order saved = orderRepository.save(order);
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
            // estado anterior) e falta devolver o dinheiro. Métodos offline
            // devolvem null — não há nada a estornar. A reserva de idempotência
            // é libertada para o cliente poder repetir a compra.
            if (hasIdempotencyKey) {
                idempotency.release(idempotencyKey);
            }
            if (paymentReference != null) {
                paymentService.refund(paymentReference);
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
    private void decrementStockAndSold(Map<String, Integer> toDecrement) {
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

        restoreStockAndSold(toRestore);

        // Email SÓ após commit — um rollback a seguir não pode anunciar um
        // cancelamento que não aconteceu.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                emailService.sendOrderCancellation(cancelled);
            }
        });
        return cancelled;
    }

    /**
     * Restaura stock e vendas depois de um cancelamento (agrupa por produto).
     * Usa o UPDATE atómico do repositório: repor em paralelo com um checkout
     * nunca perde uma das atualizações.
     */
    private void restoreStockAndSold(Map<String, Integer> toRestore) {
        for (Map.Entry<String, Integer> e : toRestore.entrySet()) {
            productRepository.restoreStockAndSold(e.getKey(), e.getValue());
        }
    }

    // ── Transição de estado (admin) ───────────────────────────────────────────────

    /**
     * Atualiza o estado de um pedido (admin) — apenas transições para a frente
     * na timeline dos estados; recuar ou um estado inválido → 400.
     */
    @Transactional
    public Order updateStatus(String id, String statusLabel) {
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
        Order updated = orderRepository.save(order);
        // Email de atualização do estado (assíncrono e só após commit).
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                emailService.sendOrderStatusUpdate(updated);
            }
        });
        return updated;
    }

    // ── Leitura ──────────────────────────────────────────────────────────────────

    /**
     * Teto do histórico por utilizador — {@code Order.items} é EAGER, pelo que o
     * histórico inteiro (com itens) podia crescer sem limite com a antiguidade da
     * conta. 200 pedidos cobre qualquer cliente real; para mais, paginar (como o
     * painel admin).
     */
    private static final int MAX_MY_ORDERS = 200;

    @Transactional(readOnly = true)
    public List<Order> getMyOrders(String userId) {
        return orderRepository.findRecentByUserId(userId, PageRequest.of(0, MAX_MY_ORDERS));
    }

    /** Tamanho de página por omissão do painel. */
    private static final int DEFAULT_PAGE_SIZE = 20;

    /** Teto do tamanho de página — `?size=100000` não pode voltar a carregar tudo. */
    private static final int MAX_PAGE_SIZE = 100;

    /**
     * Página de pedidos (admin), opcionalmente filtrada por estado.
     * Estado inválido → 400 (para o admin apanhar erros de filtro cedo).
     *
     * <p>Tudo é resolvido no <strong>SQL</strong>: o filtro de estado, a
     * ordenação, o limite/deslocamento e a contagem. Antes carregava-se o
     * histórico completo (com os itens, EAGER) e filtrava-se em memória — o
     * painel e o servidor cresciam sem limite com o número de pedidos. A
     * contagem por estado vai numa única query {@code group by} para os filtros
     * do painel mostrarem totais verdadeiros (e não os da página atual).</p>
     */
    @Transactional(readOnly = true)
    public OrderPage listAllOrders(String statusLabel, int page, int size) {
        OrderStatus status = null;
        if (statusLabel != null && !statusLabel.isBlank()) {
            status = OrderStatus.fromLabel(statusLabel)
                    .orElseThrow(() -> ApiException.badRequest("Estado inválido: " + statusLabel));
        }

        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        // Desempate pelo id: sem ele, dois pedidos com a mesma data podiam trocar
        // de posição entre páginas e aparecer repetidos (ou nenhum) ao paginar.
        Pageable pageable = PageRequest.of(
                Math.max(page, 0),
                safeSize,
                Sort.by(Sort.Order.desc("date"), Sort.Order.desc("id")));

        Page<Order> result = status == null
                ? orderRepository.findAll(pageable)
                : orderRepository.findByStatus(status, pageable);

        Map<String, Long> statusCounts = new LinkedHashMap<>();
        for (OrderStatus s : OrderStatus.values()) {
            statusCounts.put(s.getLabel(), 0L);
        }
        for (Object[] row : orderRepository.countGroupedByStatus()) {
            statusCounts.put(((OrderStatus) row[0]).getLabel(), ((Number) row[1]).longValue());
        }

        return new OrderPage(result.getContent(), result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages(), result.hasNext(), statusCounts);
    }

    @Transactional(readOnly = true)
    public Order getOrder(String id, UserPrincipal principal) {
        return getOrder(id, principal, null);
    }

    /**
     * Lê um pedido por ID.
     *
     * <ul>
     *   <li>Pedido ligado a uma conta: só o dono (ou um admin, para apoio ao
     *       cliente) o pode ver.</li>
     *   <li>Pedido de convidado (sem conta): exige, além do ID, uma prova de
     *       contacto — o {@code email} ou o telefone usados no checkout. Sem
     *       isto, quem tivesse o ID (ex.: um link reencaminhado) via nome,
     *       morada e telefone. Devolve 404 (não 401) quando não coincide, para
     *       não confirmar a existência do pedido.</li>
     * </ul>
     */
    @Transactional(readOnly = true)
    public Order getOrder(String id, UserPrincipal principal, String contact) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Pedido não encontrado"));
        String userId = principal == null ? null : principal.id();
        boolean admin = principal != null && "ADMIN".equalsIgnoreCase(principal.role());
        if (admin) {
            return order;
        }
        if (order.getUserId() != null) {
            if (!order.getUserId().equals(userId)) {
                throw ApiException.unauthorized("Não tem acesso a este pedido");
            }
            return order;
        }
        if (contactMatches(order, contact)) {
            return order;
        }
        throw ApiException.notFound("Pedido não encontrado");
    }

    /** Confirma se o contacto (email ou telefone) corresponde ao do pedido. */
    private static boolean contactMatches(Order order, String contact) {
        if (contact == null || contact.isBlank() || order.getAddress() == null) {
            return false;
        }
        String candidate = contact.trim();
        String orderEmail = order.getAddress().getEmail();
        if (orderEmail != null && orderEmail.equalsIgnoreCase(candidate)) {
            return true;
        }
        String orderPhone = order.getAddress().getPhone();
        return orderPhone != null && digits(orderPhone).equals(digits(candidate))
                && !digits(candidate).isEmpty();
    }

    /** Só os dígitos (para comparar telefones com/sem +258, espaços, hífenes). */
    private static String digits(String value) {
        return value == null ? "" : value.replaceAll("[^0-9]", "");
    }

    // ── Estatísticas ─────────────────────────────────────────────────────────────

    /**
     * Estados que contam como receita (pagamento já confirmado). Cancelado e
     * "Pedido recebido" ficam de fora — o pagamento ainda pode não acontecer.
     */
    private static final List<OrderStatus> REVENUE_STATUSES = List.of(
            OrderStatus.PAGAMENTO_CONFIRMADO,
            OrderStatus.EM_PREPARACAO,
            OrderStatus.ENVIADO,
            OrderStatus.EM_TRANSITO,
            OrderStatus.ENTREGUE);

    /**
     * Estatísticas gerais de vendas (admin) para o painel analytics.
     *
     * <p>Toda a agregação acontece <strong>no SQL</strong>: contagens por estado,
     * somas e a série diária vêm de queries que devolvem meia dúzia de linhas.
     * Antes carregava-se o histórico completo com os itens (EAGER) e somava-se em
     * memória — memória e latência a crescer sem limite com o número de pedidos.</p>
     */
    @Transactional(readOnly = true)
    public Map<String, Object> salesStats() {
        long totalOrders = orderRepository.count();
        long deliveredOrders = orderRepository.countByStatus(OrderStatus.ENTREGUE);
        long cancelledOrders = orderRepository.countByStatus(OrderStatus.CANCELADO);
        long paidOrders = orderRepository.countByStatusIn(REVENUE_STATUSES);
        long inProgressOrders = totalOrders - deliveredOrders - cancelledOrders;

        BigDecimal revenue = orderRepository.sumTotalByStatusIn(REVENUE_STATUSES);
        BigDecimal shippingCollected = orderRepository.sumShippingByStatusIn(REVENUE_STATUSES);
        BigDecimal discountsGiven = orderRepository.sumDiscountByStatusIn(REVENUE_STATUSES);
        BigDecimal cancelledValue = orderRepository.sumTotalByStatus(OrderStatus.CANCELADO);

        // Top 5 produtos por receita (uma linha por produto, já ordenada no SQL).
        // Só pedidos com pagamento confirmado: coerente com a receita acima.
        List<Map<String, Object>> topProducts = new ArrayList<>();
        for (Object[] row : orderRepository.topProductsByRevenue(REVENUE_STATUSES)) {
            if (topProducts.size() >= 5) {
                break;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("productId", row[0]);
            item.put("name", row[1]);
            item.put("revenue", row[2]);
            topProducts.add(item);
        }

        // Dias com vendas, mais recente primeiro (máx. 30).
        List<Map<String, Object>> daysSeries = new ArrayList<>();
        for (Object[] row : orderRepository.dailySeries(REVENUE_STATUSES)) {
            if (daysSeries.size() >= 30) {
                break;
            }
            Map<String, Object> day = new LinkedHashMap<>();
            day.put("date", String.format("%04d-%02d-%02d",
                    ((Number) row[0]).intValue(), ((Number) row[1]).intValue(), ((Number) row[2]).intValue()));
            day.put("orders", ((Number) row[3]).longValue());
            day.put("revenue", row[4]);
            daysSeries.add(day);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalOrders", totalOrders);
        result.put("deliveredOrders", deliveredOrders);
        result.put("cancelledOrders", cancelledOrders);
        result.put("inProgressOrders", inProgressOrders);
        result.put("revenue", revenue);
        result.put("shippingCollected", shippingCollected);
        result.put("discountsGiven", discountsGiven);
        result.put("cancelledValue", cancelledValue);
        // Ticket médio = receita confirmada / pedidos que a geraram (e não o
        // total de pedidos: incluir cancelados e pedidos offline por pagar
        // misturava grandezas e fazia o indicador desabar sem a receita mudar).
        result.put("avgOrderValue", paidOrders > 0
                ? revenue.divide(BigDecimal.valueOf(paidOrders), 2, java.math.RoundingMode.HALF_UP)
                : BigDecimal.ZERO);
        result.put("topProducts", topProducts);
        result.put("days", daysSeries);
        return result;
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
