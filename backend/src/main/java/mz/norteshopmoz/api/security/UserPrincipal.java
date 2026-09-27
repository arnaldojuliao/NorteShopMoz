package mz.norteshopmoz.api.security;

/**
 * Principal autenticado colocado no SecurityContext pelo filtro JWT.
 *
 * <p>{@code sessionId} é o {@code sid} do token (ver {@link SessionIdleService}).
 * Fica {@code null} em tokens sem sessão associada (emitidos antes deste controlo)
 * e nos testes que constroem o principal sem sid.</p>
 */
public record UserPrincipal(String id, String email, String fullName, String role, String sessionId) {

    /** Construtor sem sessão — mantém compatibilidade com o código/testes existentes. */
    public UserPrincipal(String id, String email, String fullName, String role) {
        this(id, email, fullName, role, null);
    }
}
