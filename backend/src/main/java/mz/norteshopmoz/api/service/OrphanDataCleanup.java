package mz.norteshopmoz.api.service;

import java.time.Instant;
import mz.norteshopmoz.api.repository.AddressRepository;
import mz.norteshopmoz.api.repository.CartRepository;
import mz.norteshopmoz.api.repository.FavoriteRepository;
import mz.norteshopmoz.api.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Expurgo de dados órfãos/expirados na base de dados.
 *
 * <p>Bean separado de propósito: as quatro operações correm dentro de uma
 * transação, e a chamada tem de vir de fora (um método {@code @Transactional}
 * invocado de dentro do mesmo bean não passa pelo proxy e não abre transação).</p>
 *
 * <p>Cada operação é um UPDATE/DELETE em massa — uma instrução SQL, sem
 * carregar linhas para memória. É idempotente: correr duas vezes seguidas não
 * altera mais nada.</p>
 */
@Component
public class OrphanDataCleanup {

    private static final Logger log = LoggerFactory.getLogger(OrphanDataCleanup.class);

    private final UserRepository userRepository;
    private final FavoriteRepository favoriteRepository;
    private final AddressRepository addressRepository;
    private final CartRepository cartRepository;

    public OrphanDataCleanup(UserRepository userRepository, FavoriteRepository favoriteRepository,
            AddressRepository addressRepository, CartRepository cartRepository) {
        this.userRepository = userRepository;
        this.favoriteRepository = favoriteRepository;
        this.addressRepository = addressRepository;
        this.cartRepository = cartRepository;
    }

    /** Resultado do expurgo (contagens removidas). */
    public record Result(int verificationTokens, int resetTokens, int favorites, int addresses, int carts) {
        public int total() {
            return verificationTokens + resetTokens + favorites + addresses + carts;
        }
    }

    /** Corre os quatro expurgos numa única transação. */
    @Transactional
    public Result purge() {
        Instant now = Instant.now();
        // Credenciais expiradas: quem não confirma o email / não usa o link de
        // reposição deixava o token gravado para sempre.
        int verificationTokens = userRepository.clearExpiredVerificationTokens(now);
        int resetTokens = userRepository.clearExpiredResetTokens(now);
        // Linhas de utilizadores que já não existem (conta removida em manutenção).
        int favorites = favoriteRepository.deleteOrphans();
        int addresses = addressRepository.deleteOrphans();
        int carts = cartRepository.deleteOrphanAccountCarts();
        log.info("Expurgo de dados órfãos: {} credenciais de verificação, {} de reposição de password, "
                        + "{} favoritos, {} moradas, {} carrinhos de conta.",
                verificationTokens, resetTokens, favorites, addresses, carts);
        return new Result(verificationTokens, resetTokens, favorites, addresses, carts);
    }
}
