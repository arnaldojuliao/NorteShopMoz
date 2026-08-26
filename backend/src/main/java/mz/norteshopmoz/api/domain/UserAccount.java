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

    /** Foto de perfil — data URL (ex.: data:image/webp;base64,…), opcional. */
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

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
