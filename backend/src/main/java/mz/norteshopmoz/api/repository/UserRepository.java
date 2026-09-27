package mz.norteshopmoz.api.repository;

import java.time.Instant;
import java.util.Optional;
import mz.norteshopmoz.api.domain.UserAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<UserAccount, String> {

    Optional<UserAccount> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    Optional<UserAccount> findByVerificationToken(String verificationToken);

    Optional<UserAccount> findByResetToken(String resetToken);

    /**
     * Limpa os tokens/códigos de verificação de email que já expiraram.
     *
     * <p>Quem confirma o email (por link ou código) fica com estes campos a null
     * via {@code markVerified}. Quem nunca confirma deixava-os gravados para
     * sempre — credenciais expiradas a acumular na base de dados (e o {@code
     * verificationToken} é também a chave do endpoint público de confirmação).
     * Só toca em contas <strong>não verificadas</strong>: nunca mexe em quem já
     * confirmou. Update em massa: uma instrução SQL, sem carregar contas.</p>
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update UserAccount u set u.verificationToken = null, u.verificationCode = null, "
            + "u.verificationTokenExpiry = null, u.verificationCodeAttempts = 0 "
            + "where u.emailVerified = false and u.verificationTokenExpiry is not null "
            + "and u.verificationTokenExpiry < :now")
    int clearExpiredVerificationTokens(@Param("now") Instant now);

    /**
     * Limpa os links de reposição de palavra-passe expirados (válidos 1 hora).
     * Mesmo raciocínio: quem os usa fica com os campos a null em
     * {@code resetPassword}; quem pede e não usa deixava-os para sempre.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update UserAccount u set u.resetToken = null, u.resetTokenExpiry = null "
            + "where u.resetTokenExpiry is not null and u.resetTokenExpiry < :now")
    int clearExpiredResetTokens(@Param("now") Instant now);
}
