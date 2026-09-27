package mz.norteshopmoz.api.service;

import mz.norteshopmoz.api.domain.Coupon;
import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.OrderStatus;
import mz.norteshopmoz.api.domain.Product;
import mz.norteshopmoz.api.domain.UserAccount;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.OrderRepository;
import mz.norteshopmoz.api.repository.ProductRepository;
import mz.norteshopmoz.api.repository.UserRepository;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.web.dto.CouponRequest;
import mz.norteshopmoz.api.web.dto.OrderRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("unit-test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class OrderServiceTest {

    @Autowired
    OrderService orderService;

    @Autowired
    OrderRepository orderRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    ProductRepository productRepository;

    @Autowired
    CouponService couponService;

    private UserPrincipal createPrincipal(String userId, String role) {
        return new UserPrincipal(userId, "test@example.com", "Test User", role);
    }

    private UserAccount createUser(String email) {
        return createUser(email, "CUSTOMER");
    }

    private UserAccount createUser(String email, String role) {
        return UserAccount.builder()
                .email(email)
                .fullName("User " + email)
                .passwordHash("hash")
                .role(role)
                .authProvider("EMAIL")
                .build();
    }

    private OrderRequest createOrderRequest(String email) {
        return createOrderRequest(email, null);
    }

    /** O último argumento é o código do cupão (null = sem cupão). */
    private OrderRequest createOrderRequest(String email, String couponCode) {
        return new OrderRequest(
                List.of(new OrderRequest.ItemRequest("p-001", "product-slug", "Product", "img.jpg", new BigDecimal("1000"), 1, null)),
                new BigDecimal("1000"),
                new BigDecimal("100"),
                new BigDecimal("0"),
                new BigDecimal("1100"),
                new OrderRequest.AddressRequest("John", "+258840000000", email, "Street", "City", "Maputo Cidade", null),
                "m-pesa",
                new OrderRequest.PaymentInfoRequest("+258840000000", null),
                couponCode
        );
    }

    @Test
    void createOrder_guestCheckout_createsOrder() {
        String email = "guest-" + UUID.randomUUID() + "@example.com";
        OrderRequest request = createOrderRequest(email);

        Order order = orderService.createOrder(request, null, "idem-key-" + UUID.randomUUID());

        assertThat(order.getId()).isNotBlank();
        assertThat(order.getUserId()).isNull();
        assertThat(order.getStatus()).isIn(OrderStatus.PEDIDO_RECEBIDO, OrderStatus.PAGAMENTO_CONFIRMADO);
    }

    @Test
    void createOrder_authenticatedUser_associatesWithUser() {
        String email = "buyer-" + UUID.randomUUID() + "@example.com";
        UserAccount user = userRepository.save(createUser(email));

        OrderRequest request = createOrderRequest(email);
        Order order = orderService.createOrder(request, user.getId(), "idem-key-" + UUID.randomUUID());

        assertThat(order.getUserId()).isEqualTo(user.getId());
    }

    @Test
    void createOrder_idempotencyKey_returnsSameOrder() {
        String email = "idempotent-" + UUID.randomUUID() + "@example.com";
        String idemKey = "same-key-" + UUID.randomUUID();
        OrderRequest request = createOrderRequest(email);

        Order first = orderService.createOrder(request, null, idemKey);
        Order second = orderService.createOrder(request, null, idemKey);

        assertThat(second.getId()).isEqualTo(first.getId());
    }

    @Test
    void createOrder_withCoupon_appliesDiscountAndRecordsCode() {
        String email = "coupon-" + UUID.randomUUID() + "@example.com";
        // Código único por execução (o cupão é persistido e o código é único).
        String code = "TESTE" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        Coupon coupon = couponService.create(new CouponRequest(
                code, new BigDecimal("10"), "PERCENT", null, null, true, 0));

        Order withoutCoupon = orderService.createOrder(
                createOrderRequest(email), null, "k-" + UUID.randomUUID());
        Order withCoupon = orderService.createOrder(
                createOrderRequest(email, coupon.getCode()), null, "k-" + UUID.randomUUID());

        assertThat(withCoupon.getCouponCode()).isEqualTo(code);
        // 10% sobre o subtotal (1000 MT) tem de baixar o total face ao pedido sem cupão.
        assertThat(withCoupon.getTotal()).isLessThan(withoutCoupon.getTotal());
        // O contador de utilizações é incrementado ao criar o pedido.
        assertThat(couponService.list().stream()
                .filter(c -> c.getCode().equals(code))
                .findFirst()
                .orElseThrow()
                .getUsedCount()).isEqualTo(1);
    }

    @Test
    void createOrder_concurrentLastUnit_isNotOversold() throws Exception {
        // Produto com uma única unidade em stock. Dois checkouts concorrentes
        // pedem essa unidade: o lock de escrita tem de garantir que só um passa
        // (antes, ambos liam stock=1 e vendiam a mesma unidade duas vezes).
        String uid = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        Product product = productRepository.save(Product.builder()
                .id("conc-" + uid)
                .slug("conc-" + uid)
                .name("Produto Concorrência")
                .category("eletronicos")
                .price(new BigDecimal("500"))
                .stock(1)
                .sold(0)
                .shortDescription("teste")
                .images(List.of())
                .description(List.of())
                .specs(List.of())
                .badges(List.of())
                .deliveryDays(List.of(3, 7))
                .tags(List.of())
                .build());

        OrderRequest request = new OrderRequest(
                List.of(new OrderRequest.ItemRequest(product.getId(), product.getSlug(), product.getName(),
                        "img.jpg", product.getPrice(), 1, null)),
                new BigDecimal("500"), new BigDecimal("100"), BigDecimal.ZERO, new BigDecimal("600"),
                new OrderRequest.AddressRequest("John", "+258840000000", "conc@example.com",
                        "Street", "City", "Maputo Cidade", null),
                "m-pesa", new OrderRequest.PaymentInfoRequest("+258840000000", null), null);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger success = new AtomicInteger();
        AtomicInteger failures = new AtomicInteger();
        Callable<Void> task = () -> {
            start.await();
            try {
                orderService.createOrder(request, null, "k-" + UUID.randomUUID());
                success.incrementAndGet();
            } catch (ApiException e) {
                failures.incrementAndGet();
            }
            return null;
        };
        Future<Void> first = pool.submit(task);
        Future<Void> second = pool.submit(task);
        start.countDown();
        first.get(30, TimeUnit.SECONDS);
        second.get(30, TimeUnit.SECONDS);
        pool.shutdown();

        assertThat(success.get()).isEqualTo(1);
        assertThat(failures.get()).isEqualTo(1);
        assertThat(productRepository.findById(product.getId()).orElseThrow().getStock()).isZero();
    }

    @Test
    void getMyOrders_returnsOnlyUserOrders() {
        String unique = UUID.randomUUID().toString();
        UserAccount user1 = userRepository.save(createUser("user1-" + unique + "@example.com"));
        UserAccount user2 = userRepository.save(createUser("user2-" + unique + "@example.com"));

        orderService.createOrder(createOrderRequest("user1-" + unique + "@example.com"), user1.getId(), "k1-" + UUID.randomUUID());
        orderService.createOrder(createOrderRequest("user1-" + unique + "@example.com"), user1.getId(), "k2-" + UUID.randomUUID());
        orderService.createOrder(createOrderRequest("user2-" + unique + "@example.com"), user2.getId(), "k3-" + UUID.randomUUID());

        List<Order> orders = orderService.getMyOrders(user1.getId());

        assertThat(orders).hasSize(2);
        assertThat(orders).allMatch(o -> o.getUserId().equals(user1.getId()));
    }

    @Test
    void getOrder_ownerCanAccess() {
        String unique = UUID.randomUUID().toString();
        UserAccount user = userRepository.save(createUser("owner-" + unique + "@example.com"));
        Order order = orderService.createOrder(createOrderRequest("owner-" + unique + "@example.com"), user.getId(), "k-" + UUID.randomUUID());

        Order found = orderService.getOrder(order.getId(), createPrincipal(user.getId(), "CUSTOMER"));

        assertThat(found.getId()).isEqualTo(order.getId());
    }

    @Test
    void getOrder_adminCanAccessAny() {
        String unique = UUID.randomUUID().toString();
        UserAccount user = userRepository.save(createUser("adminTarget-" + unique + "@example.com"));
        Order order = orderService.createOrder(createOrderRequest("adminTarget-" + unique + "@example.com"), user.getId(), "k-" + UUID.randomUUID());
        UserAccount admin = userRepository.save(createUser("admin-" + unique + "@example.com", "ADMIN"));

        Order found = orderService.getOrder(order.getId(), createPrincipal(admin.getId(), "ADMIN"));

        assertThat(found.getId()).isEqualTo(order.getId());
    }

    @Test
    void getOrder_otherUserCannotAccess() {
        String unique = UUID.randomUUID().toString();
        UserAccount user1 = userRepository.save(createUser("user1-" + unique + "@example.com"));
        UserAccount user2 = userRepository.save(createUser("user2-" + unique + "@example.com"));
        Order order = orderService.createOrder(createOrderRequest("user1-" + unique + "@example.com"), user1.getId(), "k-" + UUID.randomUUID());

        assertThatThrownBy(() -> orderService.getOrder(order.getId(), createPrincipal(user2.getId(), "CUSTOMER")))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Não tem acesso a este pedido");
    }
}