package mz.norteshopmoz.api.service;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import mz.norteshopmoz.api.config.ShippingConfig;
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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gestão de pedidos.
 *
 * <p>Os totais são sempre calculados no servidor a partir do catálogo — o payload do
 * cliente é apenas informativo: subtotal e desconto vêm dos preços reais dos produtos,
 * o envio da tabela de províncias (grátis acima de 5.000 MT), espelhando as regras do
 * frontend (checkout sem login — guest checkout).
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

    public OrderService(OrderRepository orderRepository, ProductRepository productRepository,
            EmailService emailService, ShippingConfig shippingConfig,
            OrderIdempotencyService idempotency, PaymentService paymentService) {
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.emailService = emailService;
        this.shippingConfig = shippingConfig;
        this.idempotency = idempotency;
        this.paymentService = paymentService;
    }

    @Transactional
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
        String paymentMethod = request.paymentMethod() == null
                ? "Pagamento na entrega"
                : request.paymentMethod().trim();
        // Resolve o método (rótulo ou alias) — desconhecido → 400. Métodos pagos
        // online (M-Pesa/e-Mola/cartão) são cobrados no gateway (simulado em dev).
        PaymentService.PaymentMethodInfo method = paymentService.resolve(paymentMethod)
                .orElseThrow(() -> ApiException.badRequest("Método de pagamento indisponível: " + paymentMethod));
        String paymentReference = paymentService.authorize(method, request.paymentInfo());

        List<OrderItem> items = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal discount = BigDecimal.ZERO;

        for (OrderRequest.ItemRequest item : request.items()) {
            Product product = resolveProduct(item);
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
                discount = discount.add(oldPrice.subtract(price).multiply(BigDecimal.valueOf(qty)));
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
        }

        BigDecimal shipping = subtotal.compareTo(ShippingConfig.FREE_SHIPPING_THRESHOLD) >= 0
                ? BigDecimal.ZERO
                : shippingConfig.feeFor(request.address().province());
        // Clamp a zero como o frontend (Math.max(0, subtotal − desconto) + envio)
        BigDecimal total = subtotal.subtract(discount).max(BigDecimal.ZERO).add(shipping);

        Order order = Order.builder()
                .id("NSM-" + newOrderId())
                .date(Instant.now())
                .userId(userId)
                .items(items)
                .subtotal(subtotal)
                .shipping(shipping)
                .discount(discount)
                .total(total)
                // Pagos online no checkout já entram com pagamento confirmado.
                .status(method.paidOnline() ? OrderStatus.PAGAMENTO_CONFIRMADO : OrderStatus.PEDIDO_RECEBIDO)
                .address(toAddress(request.address()))
                .paymentMethod(method.label())
                .paymentReference(paymentReference)
                .build();

        Order saved = orderRepository.save(order);
        idempotency.remember(idempotencyKey, saved);
        // Email de confirmação com o estado de entrega (assíncrono — nunca bloqueia o pedido).
        emailService.sendOrderConfirmation(saved);
        return saved;
    }

    /** ID aleatório de 12 caracteres (32^12 ≈ 2^60 — colisões negligenciáveis). */
    private static String newOrderId() {
        StringBuilder sb = new StringBuilder(ORDER_ID_LENGTH);
        for (int i = 0; i < ORDER_ID_LENGTH; i++) {
            sb.append(ORDER_ID_ALPHABET[RANDOM.nextInt(ORDER_ID_ALPHABET.length)]);
        }
        return sb.toString();
    }

    /** Resolve o produto pelo id (ou slug) do catálogo — falha se não existir. */
    private Product resolveProduct(OrderRequest.ItemRequest item) {
        if (item.productId() != null) {
            Product product = productRepository.findById(item.productId()).orElse(null);
            if (product != null) {
                return product;
            }
        }
        if (item.slug() != null) {
            Product product = productRepository.findBySlug(item.slug()).orElse(null);
            if (product != null) {
                return product;
            }
        }
        throw ApiException.badRequest("Produto não encontrado no catálogo: " + item.name());
    }

    /**
     * Atualiza o estado de um pedido (admin) — apenas transições para a frente
     * na timeline dos 6 estados; recuar ou um estado inválido → 400.
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
        order.setStatus(next);
        Order updated = orderRepository.save(order);
        // Email de atualização do estado de entrega (assíncrono).
        emailService.sendOrderStatusUpdate(updated);
        return updated;
    }

    @Transactional(readOnly = true)
    public List<Order> getMyOrders(String userId) {
        return orderRepository.findByUserIdOrderByDateDesc(userId);
    }

    /**
     * Lista todos os pedidos (admin), opcionalmente filtrados por estado.
     * Estado inválido → 400 (para o admin apanhar erros de filtro cedo).
     */
    @Transactional(readOnly = true)
    public List<Order> listAllOrders(String statusLabel) {
        if (statusLabel != null && !statusLabel.isBlank()) {
            OrderStatus status = OrderStatus.fromLabel(statusLabel)
                    .orElseThrow(() -> ApiException.badRequest("Estado inválido: " + statusLabel));
            return orderRepository.findAllByOrderByDateDesc().stream()
                    .filter(o -> o.getStatus() == status)
                    .toList();
        }
        return orderRepository.findAllByOrderByDateDesc();
    }

    @Transactional(readOnly = true)
    public Order getOrder(String id, UserPrincipal principal) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Pedido não encontrado"));
        // Pedidos de utilizadores só são visíveis ao dono — exceto admins,
        // que podem consultar qualquer pedido (ex.: apoio ao cliente).
        String userId = principal == null ? null : principal.id();
        boolean admin = principal != null && "ADMIN".equalsIgnoreCase(principal.role());
        if (order.getUserId() != null && !order.getUserId().equals(userId) && !admin) {
            throw ApiException.unauthorized("Não tem acesso a este pedido");
        }
        return order;
    }

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
