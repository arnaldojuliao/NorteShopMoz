package mz.norteshopmoz.api.security;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Cache TTL local do role por utilizador.
 *
 * <p>O filtro JWT re-lia o role na base de dados EM TODOS os pedidos autenticados
 * (para promoções/rebaixamentos aplicarem sem novo login). Sob carga, isso punha
 * uma query de DB extra em cada request — a carga da base de dados crescia com o
 * tráfego, não com o trabalho real.</p>
 *
 * <p>Com esta cache, o role é lido no máximo uma vez por minuto por utilizador:
 * uma mudança de role (ex.: promoção a ADMIN) aplica-se no máximo em 60 s.
 * Implementação mínima (sem dependências): mapa concorrente com timestamp de
 * expiração por entrada e teto de tamanho — entradas extra expiram pelo TTL
 * normal e o mapa não cresce além do número de utilizadores ativos numa janela
 * de 60 s.</p>
 */
@Component
public class RoleCache {

    private static final long TTL_MS = 60_000;
    /** Teto de entradas (utilizações ativas por minuto é ordens de grandeza abaixo). */
    private static final int MAX_ENTRIES = 20_000;

    private record Entry(String role, long expiresAt) {}

    private final Map<String, Entry> cache = new ConcurrentHashMap<>();

    /**
     * Devolve o role em cache para o utilizador, ou {@code null} se expirado/
     * inexistente — nesse caso o chamador deve carregar da DB e chamar
     * {@link #put}.
     */
    public String get(String userId) {
        Entry entry = cache.get(userId);
        if (entry == null) {
            return null;
        }
        if (entry.expiresAt() < System.currentTimeMillis()) {
            cache.remove(userId, entry);
            return null;
        }
        return entry.role();
    }

    /** Guarda o role do utilizador (com TTL de 60 s). */
    public void put(String userId, String role) {
        if (userId == null || role == null) {
            return;
        }
        // Teto simples: acima do limite, ignora writes novos (as entradas velhas
        // expiram pelo TTL e libertam espaço).
        if (cache.size() >= MAX_ENTRIES && !cache.containsKey(userId)) {
            return;
        }
        cache.put(userId, new Entry(role, System.currentTimeMillis() + TTL_MS));
    }

    /** TTL da cache (para logs/documentação). */
    public long ttlMillis() {
        return TTL_MS;
    }
}
