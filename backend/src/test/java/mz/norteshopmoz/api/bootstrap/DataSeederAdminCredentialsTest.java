package mz.norteshopmoz.api.bootstrap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import mz.norteshopmoz.api.domain.Coupon;
import mz.norteshopmoz.api.domain.UserAccount;
import mz.norteshopmoz.api.repository.CouponRepository;
import mz.norteshopmoz.api.repository.ProductRepository;
import mz.norteshopmoz.api.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * O administrador semeado no arranque não pode ficar com a password pública do
 * repositório quando o perfil `prod` está ativo (antes ficava — a JWT já tinha
 * fail-fast, as credenciais do admin não).
 */
class DataSeederAdminCredentialsTest {

    private DataSeeder seederWith(MockEnvironment environment, String email, String password) {
        return new DataSeeder(null, null, null, null, null, null, null, environment, email, password);
    }

    private MockEnvironment prod() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        return environment;
    }

    @Test
    void emProducaoRecusaAPasswordPorOmissao() {
        assertThatThrownBy(() -> seederWith(prod(), "admin@norteshopmoz.com", DataSeeder.DEFAULT_ADMIN_PASSWORD))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ADMIN_PASSWORD");
    }

    @Test
    void emProducaoRecusaPasswordsCurtas() {
        assertThatThrownBy(() -> seederWith(prod(), "admin@norteshopmoz.com", "curta123"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("demasiado curta");
    }

    @Test
    void emProducaoAceitaPasswordPropriaDeTamanhoSuficiente() {
        assertThatCode(() -> seederWith(prod(), "admin@norteshopmoz.com", "uma-password-bem-longa-2026"))
                .doesNotThrowAnyException();
    }

    /**
     * A conta pode já existir na base de dados (criada por uma versão anterior
     * com a password pública). Mudar ADMIN_PASSWORD não a altera, por isso o
     * arranque em produção tem de falhar em vez de ficar exposto.
     */
    @Test
    void emProducaoRecusaAdminJaExistenteComAPasswordPorOmissao() {
        UserRepository users = mock(UserRepository.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        UserAccount admin = UserAccount.builder()
                .email(DataSeeder.DEFAULT_ADMIN_EMAIL)
                .passwordHash("hash-antigo")
                .build();
        when(users.findByEmailIgnoreCase(DataSeeder.DEFAULT_ADMIN_EMAIL)).thenReturn(Optional.of(admin));
        when(encoder.matches(DataSeeder.DEFAULT_ADMIN_PASSWORD, "hash-antigo")).thenReturn(true);

        DataSeeder seeder = new DataSeeder(null, null, null, users, null, encoder, null, prod(),
                DataSeeder.DEFAULT_ADMIN_EMAIL, "uma-password-bem-longa-2026");

        assertThatThrownBy(seeder::run)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("password de desenvolvimento");
    }

    @Test
    void emProducaoAceitaAdminJaExistenteComPasswordPropria() throws Exception {
        UserRepository users = mock(UserRepository.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        ProductRepository products = mock(ProductRepository.class);
        CouponRepository coupons = mock(CouponRepository.class);
        UserAccount admin = UserAccount.builder()
                .email(DataSeeder.DEFAULT_ADMIN_EMAIL)
                .passwordHash("hash-proprio")
                .build();
        when(users.findByEmailIgnoreCase(DataSeeder.DEFAULT_ADMIN_EMAIL)).thenReturn(Optional.of(admin));
        when(encoder.matches(anyString(), anyString())).thenReturn(false);
        when(coupons.findByCodeIgnoreCase(anyString())).thenReturn(Optional.of(Coupon.builder().code("X").build()));
        when(products.count()).thenReturn(1L);

        DataSeeder seeder = new DataSeeder(null, products, null, users, coupons, encoder, null, prod(),
                DataSeeder.DEFAULT_ADMIN_EMAIL, "uma-password-bem-longa-2026");
        seeder.run();

        // Conta existente não é recriada nem reescrita.
        verify(users, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void emDesenvolvimentoAMesmaPasswordPorOmissaoEhAceite() {
        MockEnvironment dev = new MockEnvironment();
        assertThatCode(() -> seederWith(dev, "admin@norteshopmoz.com", DataSeeder.DEFAULT_ADMIN_PASSWORD))
                .doesNotThrowAnyException();
        assertThat(DataSeeder.DEFAULT_ADMIN_EMAIL).isEqualTo("admin@norteshopmoz.com");
    }
}
