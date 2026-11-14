package mz.norteshopmoz.api.support;

import java.text.Normalizer;
import java.util.Locale;

/**
 * Implementação Java de {@code nsm_normalize()}, exposta ao H2 dos testes pelo
 * {@code import.sql} (CREATE ALIAS).
 *
 * <p>Em produção a função é SQL/PostgreSQL (ver V13: lower + unaccent). O perfil
 * {@code unit-test} corre sobre H2 com as migrações Flyway desligadas, e sem
 * esta emulação qualquer pesquisa do catálogo rebentava nos testes com
 * «function nsm_normalize not found».</p>
 *
 * <p>A aproximação é de propósito a mesma: minúsculas + remoção de diacríticos.
 * Casos exóticos (ø, ł) diferem do unaccent — nos testes isso não importa, e o
 * comportamento real está coberto em Postgres.</p>
 */
public final class H2SearchFunctions {

    private H2SearchFunctions() {}

    public static String nsmNormalize(String txt) {
        if (txt == null) {
            return "";
        }
        String decomposed = Normalizer.normalize(txt, Normalizer.Form.NFD);
        return decomposed.replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT);
    }
}
