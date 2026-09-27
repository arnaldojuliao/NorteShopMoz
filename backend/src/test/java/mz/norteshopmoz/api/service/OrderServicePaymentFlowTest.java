package mz.norteshopmoz.api.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import mz.norteshopmoz.api.config.ShippingConfig;
import mz.norteshopmoz.api.domain.Product;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.OrderRepository;
import mz.norteshopmoz.api.repository.ProductRepository;
import mz.norteshopmoz.api.web.dto.OrderRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Ordem das operações do checkout e compensação de pagamento.
 *
 * <p>O bug original: o gateway era chamado <strong>antes</strong> de reservar o
 * stock. Se o stock esgotasse (ou o cupão atingisse o limite de usos), o pedido
 * falhava com 400 e o cliente ficava cobrado — sem pedido e sem forma de
 * estorno, porque o {@code PaymentGateway} nem tinha {@code refund}.</p>
 *
 * <p>O segundo problema (este teste): a cobrança passou a correr
 * <strong>dentro</strong> da transação de escrita, o que segurava uma ligação do
 * pool JDBC e o lock da linha do cupão durante toda a latência do gateway. Agora
 * a cobrança corre fora da transação e as escritas (stock + cupão + pedido)
 * ficam numa transação curta; uma falha aí reverte tudo e estorna a cobrança.</p>
 *
 * <p>Teste unitário puro (Mockito, sem Spring): a transação é um
 * {@link TransactionTemplate} sobre um gestor que executa o callback
 * imediatamente e propaga os erros como o real faria.</p>
 */
class OrderServicePaymentFlowTest {

    private static final String PRODUCT_ID = "p-001";

    private final OrderRepository orders = mock(OrderRepository.class);
    private final ProductRepository products = mock(ProductRepository.class);
    private final EmailService emails = mock(EmailService.class);
    private final ShippingConfig shipping = mock(ShippingConfig.class);
    private final OrderIdempotencyService idempotency = mock(OrderIdempotencyService.class);
    private final PaymentService payments = mock(PaymentService.class);
    private final CouponService coupons = mock(CouponService.class);
    private final OrderThrottleService throttle = mock(OrderThrottleService.class);

    private final OrderService service = new OrderService(
            orders, products, emails, shipping, idempotency, payments, coupons, throttle,
            immediateTransactions());

    private static final PaymentService.PaymentMethodInfo MPESA =
            new PaymentService.PaymentMethodInfo("mpesa", "M-Pesa", List.of("MPESA"), true, true, false);

    /**
     * Gestor de transações sem base de dados: o {@code TransactionTemplate}
     * executa o callback diretamente e trata o erro (rollback + propagação),
     * como o gestor real faz.
     */
    private static TransactionTemplate immediateTransactions() {
        return new TransactionTemplate(new AbstractPlatformTransactionManager() {
            @Override
            protected Object doGetTransaction() {
                return new Object();
            }

            @Override
            protected void doBegin(Object transaction, TransactionDefinition definition) {
            }

            @Override
            protected void doCommit(DefaultTransactionStatus status) {
            }

            @Override
            protected void doRollback(DefaultTransactionStatus status) {
            }
        });
    }

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        when(shipping.isValidProvince(anyString())).thenReturn(true);
        when(shipping.feeFor(anyString())).thenReturn(new BigDecimal("120"));
        when(products.findById(PRODUCT_ID)).thenReturn(Optional.of(productWithStock(1)));
        when(products.decrementStockAndSold(eq(PRODUCT_ID), anyInt())).thenReturn(1);
        when(payments.resolve(anyString())).thenReturn(Optional.of(MPESA));
        when(payments.authorize(any(), any(), any())).thenReturn("MP-TESTE12345");
        when(orders.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void cobraForaDaTransacaoDeEscrita() {
        service.createOrder(request(), null, null);

        // A cobrança (chamada externa) acontece ANTES de a transação de escrita
        // começar — nunca com o lock do cupão e uma ligação do pool presos.
        InOrder inOrder = inOrder(payments, products, orders);
        inOrder.verify(payments).authorize(any(), any(), any());
        inOrder.verify(products).decrementStockAndSold(PRODUCT_ID, 1);
        inOrder.verify(orders).save(any());
    }

    @Test
    void naoCobraNemGravaQuandoOProdutoJaEstaEsgotado() {
        when(products.findById(PRODUCT_ID)).thenReturn(Optional.of(productWithStock(0)));

        assertThatThrownBy(() -> service.createOrder(request(), null, null))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Produto esgotado");

        verify(payments, never()).authorize(any(), any(), any());
        verify(products, never()).decrementStockAndSold(anyString(), anyInt());
        verify(orders, never()).save(any());
    }

    @Test
    void estornaQuandoAUltimaUnidadeEhLevadaPorOutroCheckout() {
        // A pré-validação passou (stock=1) mas o UPDATE atómico não afetou linhas:
        // outro checkout levou a unidade entretanto. Já houve cobrança → estorno.
        when(products.decrementStockAndSold(eq(PRODUCT_ID), anyInt())).thenReturn(0);

        assertThatThrownBy(() -> service.createOrder(request(), null, null))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Stock insuficiente");

        verify(payments).refund("MP-TESTE12345");
        verify(orders, never()).save(any());
    }

    @Test
    void estornaQuandoOPedidoFalhaDepoisDaCobranca() {
        when(orders.save(any())).thenThrow(new IllegalStateException("falha ao gravar"));

        assertThatThrownBy(() -> service.createOrder(request(), null, null))
                .isInstanceOf(IllegalStateException.class);

        // A transação reverteu (stock e cupão voltam atrás) e a cobrança foi
        // devolvida ao cliente.
        verify(payments).refund("MP-TESTE12345");
    }

    @Test
    void naoEstornaQuandoOPedidoEConfirmado() {
        service.createOrder(request(), null, null);

        verify(payments, never()).refund(any());
    }

    @Test
    void metodoOfflineNaoEstornaNada() {
        // Pagamento na entrega: authorize devolve null → nada a compensar.
        when(payments.authorize(any(), any(), any())).thenReturn(null);
        when(orders.save(any())).thenThrow(new IllegalStateException("falha ao gravar"));

        assertThatThrownBy(() -> service.createOrder(request(), null, null))
                .isInstanceOf(IllegalStateException.class);

        verify(payments, never()).refund(any());
    }

    private static OrderRequest request() {
        return new OrderRequest(
                List.of(new OrderRequest.ItemRequest(PRODUCT_ID, "product-slug", "Product", "img.jpg",
                        new BigDecimal("1000"), 1, null)),
                new BigDecimal("1000"),
                new BigDecimal("100"),
                BigDecimal.ZERO,
                new BigDecimal("1100"),
                new OrderRequest.AddressRequest("John", "+258840000000", "buyer@example.com",
                        "Street", "City", "Maputo Cidade", null),
                "m-pesa",
                new OrderRequest.PaymentInfoRequest("+258840000000", null),
                null);
    }

    private static Product productWithStock(int stock) {
        return Product.builder()
                .id(PRODUCT_ID)
                .slug("product-slug")
                .name("Product")
                .category("eletronicos")
                .price(new BigDecimal("1000"))
                .stock(stock)
                .sold(0)
                .shortDescription("teste")
                .images(List.of("img.jpg"))
                .description(List.of())
                .specs(List.of())
                .badges(List.of())
                .deliveryDays(List.of(3, 7))
                .tags(List.of())
                .build();
    }
}
