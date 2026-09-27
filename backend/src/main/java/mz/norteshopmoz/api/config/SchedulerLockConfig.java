package mz.norteshopmoz.api.config;

import javax.sql.DataSource;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Locks distribuídos dos agendadores (ShedLock) — uma só execução por período,
 * mesmo com múltiplas réplicas da API.
 *
 * <p><strong>Porquê:</strong> o {@code @Scheduled} corre em <em>cada</em>
 * instância. Com uma só réplica (o desenho atual do {@code docker-compose.prod.yml})
 * é inócuo; mas ao escalar horizontalmente, todas as réplicas passariam a correr a
 * manutenção, o expurgo de carrinhos de convidado e a poda de chaves ao mesmo
 * tempo — trabalho duplicado, contenção na base de dados e logs confusos. Aqui o
 * lock vive na base de dados (partilhado por todas as réplicas), pelo que só uma
 * executa cada tarefa em cada período.</p>
 *
 * <p><strong>Relógio da base de dados</strong> ({@link JdbcTemplateLockProvider.Configuration#usingDbTime()}):
 * os hosts podem ter relógios dessincronizados e a expiração do lock não pode
 * depender do relógio local de uma réplica.</p>
 *
 * <p><strong>A sonda do Redis fica de fora</strong> (não tem {@code @SchedulerLock}):
 * cada réplica tem de verificar a <em>sua</em> ligação ao Redis — bloquear a sonda
 * entre réplicas esconderia exatamente a réplica que perdeu o acesso.</p>
 *
 * <p>O {@code defaultLockAtMostFor} é uma rede de segurança: se um processo morrer
 * a meio, o lock expira sozinho e a tarefa volta a poder correr. Cada método pode
 * ajustá-lo com {@code @SchedulerLock(lockAtMostFor = …)}.</p>
 */
@Configuration
@EnableSchedulerLock(defaultLockAtMostFor = "PT30M")
public class SchedulerLockConfig {

    @Bean
    public LockProvider lockProvider(DataSource dataSource) {
        return new JdbcTemplateLockProvider(
                JdbcTemplateLockProvider.Configuration.builder()
                        .withJdbcTemplate(new JdbcTemplate(dataSource))
                        .usingDbTime()
                        .build());
    }
}
