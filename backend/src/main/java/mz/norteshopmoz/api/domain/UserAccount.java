package mz.norteshopmoz.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Utilizador registado (autenticação JWT). A palavra-passe é guardada como hash BCrypt. */
@Entity
@Table(name = "users")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false, unique = true, length = 150)
    private String email;

    @Column(nullable = false, length = 100)
    private String fullName;

    @Column(length = 30)
    private String phone;

    /** Foto de perfil — link público (Cloudinary ou fornecedor social), opcional. */
    @Column(columnDefinition = "TEXT")
    private String avatar;

    /** Email confirmado pelo utilizador (link de verificação). Default no SQL para
     *  a coluna ser adicionável a tabelas já existentes (sem valores NULL). */
    @Column(nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private boolean emailVerified = false;

    /** Token de verificação de email (UUID, de uso único). */
    @Column(length = 64)
    private String verificationToken;

    @Column
    private Instant verificationTokenExpiry;

    /**
     * Código numérico de 6 dígitos para confirmar o email (alternativa ao link,
     * colado em /configuracoes). Vale apenas {@code CODE_TTL} (15 min) a contar de
     * {@link #verificationCodeSentAt} — expirado, é preciso pedir outro. O link de
     * verificação continua a valer 24 h.
     */
    @Column(length = 6)
    private String verificationCode;

    /**
     * Momento em que o código atual foi gerado — base da validade do código
     * (15 min). O link de verificação continua a valer 24 h ({@link
     * #verificationTokenExpiry}); cada um confirma o email por si só.
     */
    @Column
    private Instant verificationCodeSentAt;

    /**
     * Tentativas falhadas com o código. Ao atingir o limite, o código é
     * invalidado (6 dígitos são 1 milhão de combinações — sem isto, a janela de
     * validade permitia tentativa exaustiva).
     */
    @Column(nullable = false, columnDefinition = "int default 0")
    @Builder.Default
    private int verificationCodeAttempts = 0;

    /** Token de recuperação de palavra-passe (UUID, de uso único). */
    @Column(length = 64)
    private String resetToken;

    @Column
    private Instant resetTokenExpiry;

    @Column(nullable = false, length = 100)
    private String passwordHash;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String role = "CUSTOMER";

    /**
     * Método de entrada da conta: EMAIL (registo normal) ou GOOGLE/FACEBOOK
     * (login social). Default no SQL para a coluna ser adicionável a tabelas
     * já existentes (sem valores NULL).
     */
    @Column(nullable = false, length = 20, columnDefinition = "varchar(20) default 'EMAIL'")
    @Builder.Default
    private String authProvider = "EMAIL";

    /* ── Preferências de notificação (toggles em /configuracoes) ─────────
     * Defaults no SQL para colunas serem adicionáveis a tabelas já existentes. */

    @Column(nullable = false, columnDefinition = "boolean default true")
    @Builder.Default
    private boolean notifEmailOffers = true;

    @Column(nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private boolean notifEmailNews = false;

    @Column(nullable = false, columnDefinition = "boolean default true")
    @Builder.Default
    private boolean notifEmailOrder = true;

    @Column(nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private boolean notifWhatsappOffers = false;

    @Column(nullable = false, columnDefinition = "boolean default true")
    @Builder.Default
    private boolean notifWhatsappOrder = true;

    /**
     * Conta bloqueada pela operação (gestão no painel admin): o login (normal e
     * social) é recusado e as sessões ativas são revogadas no momento do bloqueio.
     * Default no SQL para a coluna ser adicionável a tabelas já existentes.
     */
    @Column(nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private boolean banned = false;

    /** Motivo do bloqueio (visível à operação; opcional). */
    @Column(length = 300)
    private String bannedReason;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
