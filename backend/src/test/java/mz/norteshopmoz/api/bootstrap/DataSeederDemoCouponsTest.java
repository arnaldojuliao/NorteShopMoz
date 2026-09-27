package mz.norteshopmoz.api.bootstrap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import mz.norteshopmoz.api.domain.Coupon;
import mz.norteshopmoz.api.domain.UserAccount;
import mz.norteshopmoz.api.repository.CategoryRepository;
import mz.norteshopmoz.api.repository.CouponRepository;
import mz.norteshopmoz.api.repository.ProductRepository;
import mz.norteshopmoz.api.repository.ReviewRepository;
import mz.norteshopmoz.api.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Cupões de demonstração ({@code BEMVINDO10}, {@code ENTREGA500}) nunca podem
 * existir ativos em produção: os códigos estão no repositório e o limite de
 * utilizações é ilimitado, ou seja, qualquer pessoa que os conhecesse tinha
 * desconto permanente (fuga de receita).
 */
class DataSeederDemoCouponsTest {

    private static final String ADMIN_EMAIL = "admin@norteshopmoz.com";
    private static final String ADMIN_PASSWORD = "uma-password-bem-longa-2026";

    private final CategoryRepository categories = mock(CategoryRepository.class);
    private final ProductRepository products = mock(ProductRepository.class);
    private final ReviewRepository reviews = mock(ReviewRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final CouponRepository coupons = mock(CouponRepository.class);
    private final PasswordEncoder encoder = mock(PasswordEncoder.class);

    private DataSeeder seeder(boolean prod) {
        MockEnvironment environment = new MockEnvironment();
        if (prod) {
            environment.setActiveProfiles("prod");
        }
        // Administrador já existente com password própria (não dispara as guardas
        // de credenciais, que têm testes próprios).
        when(users.findByEmailIgnoreCase(anyString())).thenReturn(Optional.of(
                UserAccount.builder().email(ADMIN_EMAIL).passwordHash("hash-proprio").build()));
        when(encoder.matches(anyString(), anyString())).thenReturn(false);
        // Catálogo já semeado → o seeder sai antes de ler o catalog.json.
        when(products.count()).thenReturn(10L);
        when(products.findByCreatedAtIsNull()).thenReturn(List.of());
        return new DataSeeder(categories, products, reviews, users, coupons, encoder, null,
                environment, ADMIN_EMAIL, ADMIN_PASSWORD);
    }

    @Test
    void emProducaoNaoCriaCupoesDeDemonstracao() throws Exception {
        when(coupons.findByCodeIgnoreCase(anyString())).thenReturn(Optional.empty());

        seeder(true).run();

        verify(coupons, never()).save(any());
    }

    @Test
    void emProducaoDesativaCupoesDeDemonstracaoJaExistentes() throws Exception {
        Coupon active = Coupon.builder()
                .code(DataSeeder.DEMO_COUPON_ENTREGA)
                .discountType("FIXED")
                .discountValue(new BigDecimal("500"))
                .active(true)
                .usageLimit(0)
                .usedCount(0)
                .build();
        when(coupons.findByCodeIgnoreCase(DataSeeder.DEMO_COUPON_ENTREGA)).thenReturn(Optional.of(active));
        when(coupons.findByCodeIgnoreCase(DataSeeder.DEMO_COUPON_BEMVINDO)).thenReturn(Optional.empty());

        seeder(true).run();

        ArgumentCaptor<Coupon> saved = ArgumentCaptor.forClass(Coupon.class);
        verify(coupons).save(saved.capture());
        assertThat(saved.getValue().getCode()).isEqualTo(DataSeeder.DEMO_COUPON_ENTREGA);
        assertThat(saved.getValue().isActive()).isFalse();
    }

    @Test
    void emDesenvolvimentoCriaOsCupoesDeDemonstracao() throws Exception {
        when(coupons.findByCodeIgnoreCase(anyString())).thenReturn(Optional.empty());

        seeder(false).run();

        ArgumentCaptor<Coupon> saved = ArgumentCaptor.forClass(Coupon.class);
        verify(coupons, times(2)).save(saved.capture());
        assertThat(saved.getAllValues())
                .extracting(Coupon::getCode)
                .containsExactlyInAnyOrder(DataSeeder.DEMO_COUPON_BEMVINDO, DataSeeder.DEMO_COUPON_ENTREGA);
        assertThat(saved.getAllValues()).allMatch(Coupon::isActive);
    }
}
