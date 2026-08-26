package mz.norteshopmoz.api.security;

/** Principal autenticado colocado no SecurityContext pelo filtro JWT. */
public record UserPrincipal(String id, String email, String fullName, String role) {}
