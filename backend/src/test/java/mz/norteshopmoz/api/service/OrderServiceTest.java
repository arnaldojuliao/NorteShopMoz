package mz.norteshopmoz.api.service;

import mz.norteshopmoz.api.domain.Order;
import mz.norteshopmoz.api.domain.OrderStatus;
import mz.norteshopmoz.api.domain.UserAccount;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.OrderRepository;
import mz.norteshopmoz.api.repository.UserRepository;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.web.dto.OrderRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

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
        return new OrderRequest(
                List.of(new OrderRequest.ItemRequest("p-001", "product-slug", "Product", "img.jpg", new BigDecimal("1000"), 1, null)),
                new BigDecimal("1000"),
                new BigDecimal("100"),
                new BigDecimal("0"),
                new BigDecimal("1100"),
                new OrderRequest.AddressRequest("John", "+258840000000", email, "Street", "City", "Maputo Cidade", null),
                "m-pesa",
                new OrderRequest.PaymentInfoRequest("+258840000000", null)
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