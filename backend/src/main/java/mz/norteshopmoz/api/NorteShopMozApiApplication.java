package mz.norteshopmoz.api;

import mz.norteshopmoz.api.config.AppProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * NSM · NorteShopMoz — API REST
 * <p>
 * Spring Boot 4 · Java 21 · PostgreSQL · Redis · JWT
 * </p>
 */
@SpringBootApplication
@EnableCaching
@EnableAsync
@EnableConfigurationProperties(AppProperties.class)
public class NorteShopMozApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(NorteShopMozApiApplication.class, args);
    }
}
