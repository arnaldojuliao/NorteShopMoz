package mz.norteshopmoz.api.config;

import java.lang.reflect.Method;
import java.util.Map;
import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadPoolExecutor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.aop.interceptor.AsyncUncaughtExceptionHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Executor dos métodos {@code @Async} — hoje apenas os emails transacionais do
 * {@link mz.norteshopmoz.api.service.EmailService} (verificação, reposição de
 * password, confirmação/estado/cancelamento de pedido, newsletter).
 *
 * <p><strong>Porquê um executor próprio:</strong> sem isto, o Spring Boot usa o
 * {@code applicationTaskExecutor} por omissão, com core=8, {@code maxPoolSize}
 * efetivamente ilimitado mas com a fila <strong>ilimitada</strong>. Como só
 * cresce acima do core quando a fila enche, na prática corre com 8 threads e uma
 * fila sem teto: se o Resend ficar lento (timeout de leitura de 12 s) ou em
 * baixo, os emails acumulam-se indefinidamente — memória a crescer e
 * confirmações de pedido atrasadas horas. Aqui a fila tem teto e, quando enche,
 * a tarefa é descartada com um WARN em vez de bloquear ou esgotar memória (os
 * emails são best-effort: a confirmação do pedido é a página de checkout e o
 * histórico do cliente).</p>
 *
 * <p>Nunca usar {@code CallerRunsPolicy}: os emails são submetidos dentro de
 * {@code afterCommit} do checkout e correr a tarefa na thread chamadora voltaria
 * a bloquear o pedido à espera do Resend — exatamente o que o {@code @Async}
 * evita.</p>
 */
@Configuration
public class AsyncConfig implements AsyncConfigurer {

    private static final Logger log = LoggerFactory.getLogger(AsyncConfig.class);

    @Bean(name = "applicationTaskExecutor")
    @Override
    public ThreadPoolTaskExecutor getAsyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(16);
        executor.setQueueCapacity(500);
        executor.setThreadNamePrefix("nsm-async-");
        executor.setRejectedExecutionHandler(new LoggingDiscardPolicy());
        // Propaga o X-Request-Id para o email que o pedido originou: sem isto, a
        // linha "email enviado" aparecia sem qualquer ligação ao pedido, e um
        // email que falha horas depois era impossível de correlacionar.
        executor.setTaskDecorator(AsyncConfig::withMdc);
        // No shutdown: dá tempo às tarefas em curso (emails já em envio) sem
        // travar o arranque seguinte.
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(20);
        executor.initialize();
        return executor;
    }

    /**
     * Envolve a tarefa com o MDC de quem a submeteu (o ID de correlação do
     * pedido), restaurando o contexto da thread do executor no fim — as threads
     * são reutilizadas e não podem herdar o ID de um pedido anterior.
     */
    private static Runnable withMdc(Runnable task) {
        Map<String, String> submitter = MDC.getCopyOfContextMap();
        return () -> {
            Map<String, String> previous = MDC.getCopyOfContextMap();
            if (submitter == null) {
                MDC.clear();
            } else {
                MDC.setContextMap(submitter);
            }
            try {
                task.run();
            } finally {
                if (previous == null) {
                    MDC.clear();
                } else {
                    MDC.setContextMap(previous);
                }
            }
        };
    }

    /** Falhas não capturadas de {@code void @Async} (as que o Spring não propaga). */
    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return (Throwable ex, Method method, Object... params) ->
                log.warn("Tarefa assíncrona '{}' falhou: {}", method.getName(), ex.getMessage());
    }

    /** Fila cheia → descarta e registra (não bloqueia nem lança para o chamador). */
    static final class LoggingDiscardPolicy implements RejectedExecutionHandler {
        @Override
        public void rejectedExecution(Runnable r, ThreadPoolExecutor e) {
            log.warn("Executor assíncrono saturado (fila={}, ativas={}) — tarefa descartada.",
                    e.getQueue().size(), e.getActiveCount());
        }
    }
}
