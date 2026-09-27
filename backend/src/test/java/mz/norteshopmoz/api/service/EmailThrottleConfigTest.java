package mz.norteshopmoz.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Regressão do prefixo de configuração do travão de emails.
 *
 * <p>Houve uma divergência real: o {@code application.yaml} definia
 * {@code app.email-throttle.*} e o serviço lia {@code app.mail.throttle.*}. As
 * chaves nunca se cruzavam, por isso o serviço usava sempre os valores por omissão
 * e {@code MAIL_MAX_PER_ADDRESS}, {@code MAIL_ADDRESS_WINDOW_MINUTES},
 * {@code MAIL_MAX_GLOBAL_PER_HOUR} e {@code MAIL_THROTTLE_ENABLED} não tinham
 * efeito — em produção não havia forma de ajustar ou desligar o travão.</p>
 *
 * <p>Este teste fixa o contrato: no perfil {@code unit-test} o ficheiro
 * {@code application-unit-test.properties} define
 * {@code app.email-throttle.enabled=false}. Se o serviço voltar a ler outro
 * prefixo, vê o valor por omissão ({@code true}) e o teste falha.</p>
 */
@SpringBootTest
@ActiveProfiles("unit-test")
class EmailThrottleConfigTest {

    @Autowired
    EmailThrottleService emailThrottle;

    @Test
    void leAConfiguracaoDeEmailThrottleDoPerfil() {
        assertThat(ReflectionTestUtils.getField(emailThrottle, "enabled")).isEqualTo(false);
    }
}
