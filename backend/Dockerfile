# ── Build ──────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B package -DskipTests

# ── Runtime ────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre
WORKDIR /app

# Utilizador não-root (least privilege). /app e /app/uploads ficam com o dono
# spring — os uploads locais (fallback quando não há Cloudinary) precisam de ser
# criados/escrevidos por este utilizador.
RUN groupadd --gid 1001 spring \
    && useradd --uid 1001 --gid spring --home-dir /app --shell /usr/sbin/nologin spring \
    && mkdir -p /app/uploads \
    && chown -R spring:spring /app

# curl para o healthcheck. A imagem eclipse-temurin:21-jre (Ubuntu) não traz
# curl NEM wget — o healthcheck do docker-compose usava `wget`, falhava sempre
# e o contentor ficava permanentemente unhealthy (o deploy.sh ficava preso à
# espera de UP, com a API a funcionar).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=spring:spring /app/target/norteshopmoz-api-*.jar app.jar

USER spring

EXPOSE 8080

# Healthcheck próprio da imagem: liveness (não depende de Redis/DB), coerente
# com o do docker-compose.prod.yml. Usa curl (ver acima).
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:8080/actuator/health/liveness || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
