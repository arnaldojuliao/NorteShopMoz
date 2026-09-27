package mz.norteshopmoz.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import mz.norteshopmoz.api.domain.AddressBookEntry;
import mz.norteshopmoz.api.domain.Favorite;
import mz.norteshopmoz.api.domain.UserAccount;
import mz.norteshopmoz.api.domain.UserCart;
import mz.norteshopmoz.api.repository.AddressRepository;
import mz.norteshopmoz.api.repository.CartRepository;
import mz.norteshopmoz.api.repository.FavoriteRepository;
import mz.norteshopmoz.api.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;

/**
 * Expurgo na base de dados: credenciais de verificação/reposição expiradas e
 * linhas de utilizadores que já não existem (favoritos, moradas, carrinhos).
 *
 * <p>Só toca no que é órfão ou expirado — uma conta verificada com token
 * pendente, uma conta válida ou um carrinho de convidado ficam intactos.</p>
 */
@SpringBootTest
@ActiveProfiles("unit-test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class OrphanDataCleanupDbTest {

    @Autowired
    OrphanDataCleanup cleanup;
    @Autowired
    UserRepository userRepository;
    @Autowired
    FavoriteRepository favoriteRepository;
    @Autowired
    AddressRepository addressRepository;
    @Autowired
    CartRepository cartRepository;

    private UserAccount saveUser(boolean verified, boolean expiredTokens) {
        Instant now = Instant.now();
        UserAccount user = UserAccount.builder()
                .email("orphan-" + UUID.randomUUID() + "@example.com")
                .fullName("Teste Órfãos")
                .passwordHash("hash")
                .role("CUSTOMER")
                .emailVerified(verified)
                .verificationToken("tok-" + UUID.randomUUID())
                .verificationCode("123456")
                .verificationCodeAttempts(3)
                .verificationTokenExpiry(expiredTokens ? now.minus(Duration.ofHours(1)) : now.plus(Duration.ofHours(1)))
                .resetToken("reset-" + UUID.randomUUID())
                .resetTokenExpiry(expiredTokens ? now.minus(Duration.ofHours(1)) : now.plus(Duration.ofHours(1)))
                .build();
        return userRepository.save(user);
    }

    private AddressBookEntry address(String userId) {
        return AddressBookEntry.builder()
                .userId(userId)
                .fullName("Quem")
                .phone("841234567")
                .address("Rua 1")
                .city("Maputo")
                .province("Maputo")
                .isDefault(false)
                .createdAt(Instant.now())
                .build();
    }

    @Test
    void limpaCredenciaisExpiradasEProtegeAsValidas() {
        UserAccount expired = saveUser(false, true);
        UserAccount stillValid = saveUser(false, false);
        UserAccount verified = saveUser(true, true);

        OrphanDataCleanup.Result result = cleanup.purge();

        assertThat(result.verificationTokens()).isGreaterThanOrEqualTo(1);
        assertThat(result.resetTokens()).isGreaterThanOrEqualTo(1);

        UserAccount expiredAfter = userRepository.findById(expired.getId()).orElseThrow();
        assertThat(expiredAfter.getVerificationToken()).isNull();
        assertThat(expiredAfter.getVerificationCode()).isNull();
        assertThat(expiredAfter.getVerificationTokenExpiry()).isNull();
        assertThat(expiredAfter.getVerificationCodeAttempts()).isZero();
        assertThat(expiredAfter.getResetToken()).isNull();
        assertThat(expiredAfter.getResetTokenExpiry()).isNull();

        // Token ainda dentro do prazo: não é apagado.
        UserAccount validAfter = userRepository.findById(stillValid.getId()).orElseThrow();
        assertThat(validAfter.getVerificationToken()).isNotNull();
        assertThat(validAfter.getResetToken()).isNotNull();
        assertThat(validAfter.getVerificationTokenExpiry()).isNotNull();

        // Conta verificada: o expurgo nunca lhe toca.
        UserAccount verifiedAfter = userRepository.findById(verified.getId()).orElseThrow();
        assertThat(verifiedAfter.getVerificationToken()).isNotNull();
    }

    @Test
    void apagaLinhasDeUtilizadoresInexistentesEPreservaAsValidas() {
        UserAccount owner = saveUser(false, false);
        String ghost = "ghost-" + UUID.randomUUID().toString().substring(0, 8);

        Favorite favoriteOwner = favoriteRepository.save(
                Favorite.builder().userId(owner.getId()).productId("p-valido").build());
        Favorite favoriteGhost = favoriteRepository.save(
                Favorite.builder().userId(ghost).productId("p-orfao").build());

        AddressBookEntry addressOwner = addressRepository.save(address(owner.getId()));
        AddressBookEntry addressGhost = addressRepository.save(address(ghost));

        UserCart cartOwner = cartRepository.save(UserCart.builder().userId(owner.getId()).build());
        UserCart cartGhost = cartRepository.save(UserCart.builder().userId(ghost).build());
        String guestKey = "guest:" + UUID.randomUUID();
        UserCart cartGuest = cartRepository.save(UserCart.builder().userId(guestKey).build());

        cleanup.purge();

        // Órfãos removidos.
        assertThat(favoriteRepository.findById(new Favorite.FavoriteId(ghost, "p-orfao"))).isEmpty();
        assertThat(addressRepository.findById(addressGhost.getId())).isEmpty();
        assertThat(cartRepository.findById(ghost)).isEmpty();

        // Válidos preservados.
        assertThat(favoriteRepository.findById(
                new Favorite.FavoriteId(owner.getId(), "p-valido"))).isPresent();
        assertThat(addressRepository.findById(addressOwner.getId())).isPresent();
        assertThat(cartRepository.findById(owner.getId())).isPresent();
        // O carrinho de convidado é gerido pela idade (GuestCartCleanup), não aqui.
        assertThat(cartRepository.findById(guestKey)).isPresent();

        // Sanidade: os objetos usados ainda têm os ids esperados.
        assertThat(List.of(favoriteOwner, favoriteGhost)).hasSize(2);
        assertThat(cartOwner.getUserId()).isEqualTo(owner.getId());
        assertThat(cartGuest.getUserId()).isEqualTo(guestKey);
    }
}
