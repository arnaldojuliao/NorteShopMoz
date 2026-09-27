#!/usr/bin/env bash
# =============================================================================
# NorteShopMoz — Verificação de robustez de produção
#
# Corre no CI e localmente (`./scripts/hardening-check.sh`). Falha se alguma das
# invariantes que evitam quedas/fugas em produção for revertida por engano:
#
#  1. Monitorização fechada   — portas em loopback, Grafana com password
#                               obrigatória, Prometheus sem admin API/lifecycle.
#  2. Healthcheck da API      — usa liveness (não depende de Redis/DB) e o
#                               deploy.sh tem teto de espera (não pendura).
#  3. TLS ↔ cookies           — produção não pode servir HTTP com cookies Secure
#                               nem declarar https:// sem conf SSL válida: a conf
#                               SSL é um template com ${APP_DOMAIN} (sem domínio
#                               fixo) e o deploy valida os certificados antes de
#                               subir o nginx.
#  4. Backups                 — deploy faz dump pré-deploy; os scripts de backup
#                               correm no contentor (sem password no host) e o
#                               --verify-only do cron existe.
#  5. Idle timeout de sessão  — configurado no backend, não só no cliente.
#  6. Deploy/TLS              — execução real do deploy.sh (aborta sem certs).
#  7. Rate limit e tokens     — pedidos autenticados por conta (CGNAT), tokens
#                               nunca no corpo, access token curto, uploads com
#                               volume, carrinhos de convidado expurgados.
#  8. Cache, uploads e CSP    — a cache do catálogo falha aberta (Redis em baixo
#                               não derruba o catálogo), o nginx aceita o upload
#                               de imagens (client_max_body_size), o healthcheck
#                               da API tem o `curl` instalado na imagem e o CSP só
#                               força HTTPS quando o pedido é HTTPS.
#  9. Manutenção/estatísticas — manutenção periódica e agregações no SQL.
# 10. Quedas evitadas         — db/redis/redis-cache sem portas publicadas (o
#                               conflito no host deixa o contentor "healthy" e
#                               sem rede), pool JDBC dimensionado, checkout numa
#                               só passagem ao catálogo, travão do checkout
#                               público, regras de alerta carregadas/encaminhadas
#                               e expurgo de pedidos desligado por omissão.
# 11. Disco/memória/CSP       — limite de logs em todos os contentores (o
#                               json-file enchia o disco do Postgres), shm_size
#                               no Postgres, rate limit de janela fixa (a
#                               deslizante esgotava o Redis noeviction com uns
#                               milhares de IPs), travão nos emails públicos e
#                               CSP definido num só sítio.
# =============================================================================

set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

FAILED=0
pass() { echo -e "  \033[0;32m✔\033[0m $1"; }
fail() { echo -e "  \033[0;31m✘\033[0m $1"; FAILED=1; }

# `--unbound` para literais: procuramos texto, não regex.
has() { grep -qF -- "$2" "$1" 2>/dev/null; }
lacks() { ! grep -qF -- "$2" "$1" 2>/dev/null; }

MON="monitoring/docker-compose.monitoring.yml"
PROD="docker-compose.prod.yml"
DEPLOY="deploy.sh"
BACKUP="scripts/backup.sh"
APP_YAML="backend/src/main/resources/application.yaml"
AUTH="backend/src/main/java/mz/norteshopmoz/api/service/AuthService.java"

echo "1) Monitorização não exposta na internet"
for port in 9090 9093 3001 9100 9115 9187 9121 8081; do
    if grep -qE "^      - \"127\.0\.0\.1:${port}:" "$MON"; then
        pass "porta ${port} ligada a 127.0.0.1"
    else
        fail "porta ${port} não está ligada a 127.0.0.1 (exposta na internet)"
    fi
done
if grep -qE 'GRAFANA_ADMIN_PASSWORD:\?' "$MON"; then
    pass "Grafana exige password (sem valor por omissão)"
else
    fail "Grafana com password por omissão (admin123)"
fi
# Só conta como problema se for um item ACTIVO da lista `command:` — as flags
# aparecem também em comentários a explicar porque foram removidas.
if grep -qE "^ *- '--web\.enable-(admin-api|lifecycle)'" "$MON"; then
    fail "Prometheus com admin API / lifecycle (apaga dados e desliga remotamente)"
else
    pass "Prometheus sem admin API nem lifecycle"
fi

echo "2) Healthcheck e deploy com teto de espera"
if has "$PROD" "/actuator/health/liveness"; then
    pass "healthcheck da API usa liveness (independente de Redis/DB)"
else
    fail "healthcheck da API depende de /actuator/health (cai com o Redis)"
fi
if has "$APP_YAML" "liveness:" && has "$APP_YAML" "probes:"; then
    pass "sondas liveness/readiness configuradas"
else
    fail "sondas liveness/readiness não configuradas em application.yaml"
fi
if has "$DEPLOY" "API_WAIT_SECONDS" && has "$DEPLOY" "DB_WAIT_SECONDS"; then
    pass "deploy.sh com teto de espera (não pendura)"
else
    fail "deploy.sh sem teto de espera (until … sleep infinito)"
fi
# Uma porta publicada já ocupada faz o Docker reverter o endpoint: o contentor
# arranca SEM rede e sem porta e o healthcheck (local ao contentor) diz "healthy".
if has "$DEPLOY" "docker-net-check.sh" && has "$DEPLOY" "SKIP_PORT_CHECK"; then
    pass "deploy.sh verifica as portas publicadas (evita contentor 'healthy' sem rede)"
else
    fail "deploy.sh sobe os contentores sem verificar as portas publicadas"
fi

echo "3) Coerência TLS ↔ cookies"
if has "$DEPLOY" "NGINX_CONF"; then
    pass "deploy.sh exige conf SSL do nginx quando APP_BASE_URL é https"
else
    fail "deploy.sh não valida a conf SSL do nginx para APP_BASE_URL https"
fi
NGINX_TPL="nginx/nginx.conf.template"
if has "$NGINX_TPL" '${APP_DOMAIN}' && has "$NGINX_TPL" '/etc/letsencrypt/live/${APP_DOMAIN}/fullchain.pem'; then
    pass "conf SSL é template com \${APP_DOMAIN} (sem domínio fixo nos certificados)"
else
    fail "conf SSL com caminho de certificado fixo: o nginx não arranca no domínio real"
fi
if grep -qE 'ssl_certificate[^;]*/live/[a-z0-9.-]+\.(com|net|org|mz)/' "$NGINX_TPL"; then
    fail "domínio fixo no caminho dos certificados de $NGINX_TPL"
else
    pass "nenhum domínio fixo nos caminhos dos certificados"
fi
if has "$DEPLOY" '$CERTBOT_CERTS/live/$APP_DOMAIN' && has "$DEPLOY" "fullchain.pem"; then
    pass "deploy.sh valida que os certificados existem antes de subir o nginx"
else
    fail "deploy.sh sobe o nginx sem verificar os certificados"
fi
if has "$DEPLOY" "nginx/nginx.conf.template"; then
    pass "deploy.sh renderiza a conf SSL (\${APP_DOMAIN} resolvido no host)"
else
    fail "deploy.sh não renderiza o template da conf SSL"
fi
if grep -qE '^      - \$\{CERTBOT_CERTS' "$PROD"; then
    pass "certificados do certbot montados no nginx (não só comentados)"
else
    fail "volume dos certificados comentado: ativar TLS exige editar o compose"
fi
if has "$NGINX_TPL" "/healthz" && has "$PROD" "http://localhost/healthz"; then
    pass "healthcheck do nginx em /healthz (não segue o redirect para HTTPS)"
else
    fail "healthcheck do nginx a bater em / (unhealthy no modo HTTPS)"
fi
if has "$PROD" 'NGINX_CONF:-'; then
    pass "conf do nginx configurável (HTTP por omissão, SSL quando pedido)"
else
    fail "docker-compose.prod.yml fixa a conf HTTP do nginx"
fi
if grep -q "APP_COOKIE_SECURE" backend/src/main/java/mz/norteshopmoz/api/config/ProductionConfigGuard.java; then
    pass "guard de arranque valida cookies Secure vs esquema"
else
    fail "sem validação de cookies Secure vs esquema no arranque"
fi

echo "4) Backups"
if has "$DEPLOY" "backup_before_deploy" && has "$DEPLOY" "pg_dump"; then
    pass "deploy.sh faz dump pré-deploy (as migrações não têm rollback)"
else
    fail "deploy.sh não faz backup antes de migrar"
fi
if has "$BACKUP" "exec -T \"\$DB_SERVICE\" pg_dump"; then
    pass "backup.sh corre dentro do contentor (sem pg_dump/password no host)"
else
    fail "backup.sh depende de pg_dump do host"
fi
if has "$BACKUP" "--verify-only"; then
    pass "backup.sh trata --verify-only (o cron usa-o e antes falhava sempre)"
else
    fail "backup.sh não trata --verify-only"
fi
if [[ -f scripts/install-backup-cron.sh ]] && has scripts/install-backup-cron.sh "/etc/cron.d/norteshop-backups"; then
    pass "instalador de cron presente (os backups não ficam só num modelo)"
else
    fail "sem instalador de cron: os backups automáticos não são instalados"
fi
# Backup off-site OBRIGATÓRIO também no backup diário (não só no deploy): um dump
# guardado só no VPS perde-se com o host (disco, ransomware, corrupção).
if has scripts/backup.sh "offsite_backup" && has scripts/backup.sh "SKIP_OFFSITE_BACKUP" \
        && has scripts/install-backup-cron.sh "BACKUP_S3_BUCKET" \
        && has scripts/install-backup-cron.sh "SKIP_OFFSITE_BACKUP"; then
    pass "backup diário exige destino off-site (não fica só no VPS)"
else
    fail "backup diário pode ficar só no VPS (perde-se com o host)"
fi
if grep -qE "^30 2 \* \* \* root '.*/scripts/backup\.sh'" scripts/install-backup-cron.sh; then
    pass "cron com caminho citado (sobrevive a caminhos com espaços)"
else
    fail "cron com caminho não citado"
fi

echo "5) Inatividade de sessão"
if has "$APP_YAML" "idle-timeout-minutes"; then
    pass "idle timeout configurado no servidor"
else
    fail "sem idle timeout no servidor (a sessão de 30 min era só do cliente)"
fi
if has "$AUTH" "isExpired(" && has "$AUTH" "sessionIdleService.end("; then
    pass "refresh e logout respeitam a janela de inatividade"
else
    fail "refresh/logout não aplicam a janela de inatividade"
fi

echo "6) Domínio e TLS do deploy (execução real do deploy.sh)"
# Corre o deploy.sh a sério num diretório temporário, com certificados
# inexistentes: tem de abortar ANTES de tocar no docker, com o domínio derivado
# de APP_BASE_URL no diagnóstico. Uma conf SSL com domínio fixo (norteshopmoz.com)
# + APP_BASE_URL de outro domínio = nginx sem certificado válido.
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
cp "$DEPLOY" "$tmp_dir/deploy.sh"
: > "$tmp_dir/docker-compose.prod.yml"
cat > "$tmp_dir/.env.prod" <<'ENVFILE'
JWT_SECRET=segredo_de_teste_suficientemente_longo_1234567890
DB_PASSWORD=dbpass
REDIS_PASSWORD=redispass
RESEND_API_KEY=re_test
CLOUDINARY_CLOUD_NAME=cloud
CLOUDINARY_API_KEY=key
CLOUDINARY_API_SECRET=secret
APP_BASE_URL=https://loja.exemplo.com
CORS_ALLOWED_ORIGINS=https://loja.exemplo.com
NEXT_PUBLIC_API_URL=https://loja.exemplo.com
APP_COOKIE_SECURE=true
ENVFILE
deploy_out=""
if deploy_out="$(cd "$tmp_dir" && SKIP_PORT_CHECK=1 CERTBOT_CERTS="$tmp_dir/certbot-inexistente" bash deploy.sh prod 2>&1)"; then
    fail "deploy.sh não abortou sem certificados (subiria o nginx sem TLS)"
elif grep -q "loja.exemplo.com" <<<"$deploy_out" && grep -q "Certificado em falta" <<<"$deploy_out"; then
    pass "deploy.sh deriva o domínio de APP_BASE_URL e aborta sem certificados"
else
    fail "deploy.sh não deu diagnóstico do domínio/certificado em falta: $(head -1 <<<"$deploy_out")"
fi

# Sem APP_BASE_URL https, a conf HTTP tem de continuar a ser aceite (o caminho
# das lojas que ainda servem por IP não pode ficar bloqueado). O docker e o curl
# são substituídos por shims: o objetivo é ver o que o deploy.sh faria, sem
# tocar em contentores nem esperar por sondas.
mkdir -p "$tmp_dir/bin"
cat > "$tmp_dir/bin/docker" <<'SHIM'
#!/bin/sh
[ -n "${SHIM_LOG:-}" ] && echo "NGINX_CONF=${NGINX_CONF:-<por-omissao>}" >>"$SHIM_LOG"
exit 0
SHIM
cat > "$tmp_dir/bin/curl" <<'SHIM'
#!/bin/sh
echo '{"status":"UP"}'
SHIM
# Shim do CLI 'aws': o deploy exige um destino off-site e usa `aws s3 cp` quando
# BACKUP_S3_BUCKET está definido. Um no-op bem-sucedido deixa o deploy avançar.
cat > "$tmp_dir/bin/aws" <<'SHIM'
#!/bin/sh
exit 0
SHIM
chmod +x "$tmp_dir/bin/docker" "$tmp_dir/bin/curl" "$tmp_dir/bin/aws"

cat > "$tmp_dir/.env.prod" <<'ENVFILE'
JWT_SECRET=segredo_de_teste_suficientemente_longo_1234567890
DB_PASSWORD=dbpass
REDIS_PASSWORD=redispass
RESEND_API_KEY=re_test
CLOUDINARY_CLOUD_NAME=cloud
CLOUDINARY_API_KEY=key
CLOUDINARY_API_SECRET=secret
APP_BASE_URL=http://203.0.113.9
CORS_ALLOWED_ORIGINS=http://203.0.113.9
NEXT_PUBLIC_API_URL=http://203.0.113.9
APP_COOKIE_SECURE=false
BACKUP_S3_BUCKET=nsm-backups-teste
ENVFILE
if http_out="$(cd "$tmp_dir" && SKIP_PORT_CHECK=1 PATH="$tmp_dir/bin:$PATH" bash deploy.sh prod 2>&1)"; then
    if grep -q "Certificado em falta" <<<"$http_out"; then
        fail "deploy.sh exigiu certificados em modo HTTP (bloquearia lojas sem domínio)"
    elif [[ -e "$tmp_dir/nginx/.generated/default.conf" ]]; then
        fail "modo HTTP gerou uma conf SSL (esperava a conf HTTP por omissão)"
    elif grep -q "Loja em HTTP" <<<"$http_out"; then
        pass "modo HTTP usa a conf HTTP por omissão, sem exigir certificados"
    else
        fail "modo HTTP não avisou que a loja serve HTTP"
    fi
else
    fail "deploy.sh falhou em modo HTTP: $(tail -1 <<<"$http_out")"
fi

# Backup off-site OBRIGATÓRIO: um dump guardado só no VPS que estamos a
# substituir não protege contra a perda do host — e as migrações Flyway, que
# correm no arranque, não têm rollback. Sem destino configurado o deploy TEM de
# abortar (e explicar o que falta), não avançar em silêncio.
cat > "$tmp_dir/.env.prod" <<'ENVFILE'
JWT_SECRET=segredo_de_teste_suficientemente_longo_1234567890
DB_PASSWORD=dbpass
REDIS_PASSWORD=redispass
RESEND_API_KEY=re_test
CLOUDINARY_CLOUD_NAME=cloud
CLOUDINARY_API_KEY=key
CLOUDINARY_API_SECRET=secret
APP_BASE_URL=http://203.0.113.9
CORS_ALLOWED_ORIGINS=http://203.0.113.9
NEXT_PUBLIC_API_URL=http://203.0.113.9
APP_COOKIE_SECURE=false
ENVFILE
if no_offsite_out="$(cd "$tmp_dir" && SKIP_PORT_CHECK=1 PATH="$tmp_dir/bin:$PATH" bash deploy.sh prod 2>&1)"; then
    fail "deploy.sh avançou sem destino de backup off-site (perde-se a cópia com o host)"
elif grep -q "backup off-site" <<<"$no_offsite_out" && grep -q "BACKUP_S3_BUCKET" <<<"$no_offsite_out"; then
    pass "deploy.sh exige um destino de backup off-site (aborta sem ele)"
else
    fail "deploy.sh abortou sem explicar o requisito de backup off-site: $(tail -1 <<<"$no_offsite_out")"
fi

echo "7) Rate limit, tokens, uploads e carrinhos de convidado"
RATELIMIT="backend/src/main/java/mz/norteshopmoz/api/config/RateLimitFilter.java"
AUTH_DTO="backend/src/main/java/mz/norteshopmoz/api/web/dto/AuthDtos.java"
CART_CTRL="backend/src/main/java/mz/norteshopmoz/api/web/CartController.java"
if has "$RATELIMIT" "api:u:" && has "$RATELIMIT" "anon-api"; then
    pass "rate limit chaveia pedidos autenticados por conta (não por IP)"
else
    fail "rate limit por IP: clientes atrás de CGNAT partilham a quota e recebem 429"
fi
# O bucket anónimo (checkout de convidado) tem de ser generoso — um limite
# baixo por IP estrangula todos os clientes que partilham um IP de operadora.
if has "$APP_YAML" 'anon-api:' && has "$APP_YAML" 'max-requests: ${RATE_LIMIT_ANON_MAX:600}'; then
    pass "bucket anónimo generoso (sobrevive a CGNAT)"
else
    fail "sem bucket anónimo generoso: checkout de convidado estrangulado por IP"
fi
if grep -qE "record AuthResponse\(UserDto user, String csrfToken, long expiresInSeconds\)" "$AUTH_DTO"; then
    pass "AuthResponse não devolve tokens no corpo (só cookies HttpOnly)"
else
    fail "AuthResponse devolve tokens JWT no corpo (XSS/registos ficam com o refresh token)"
fi
if has "$PROD" 'JWT_EXPIRATION: ${JWT_EXPIRATION:-3600}'; then
    pass "access token de 1 hora em produção (sessão longa via refresh rotativo)"
else
    fail "access token de longa duração em produção (era 7 dias)"
fi
if has "$PROD" "- uploads:/app/uploads" && grep -qE "^  uploads:" "$PROD"; then
    pass "uploads com volume persistente (as imagens sobrevivem ao deploy)"
else
    fail "uploads no disco efémero do contentor: imagens de produto perdem-se no deploy"
fi
if has "$APP_YAML" "guest-retention-days" \
        && [[ -f backend/src/main/resources/db/migration/V2__guest_cart_cleanup.sql ]] \
        && [[ -f backend/src/main/java/mz/norteshopmoz/api/service/GuestCartCleanup.java ]]; then
    pass "carrinhos de convidado expurgados (updated_at + tarefa agendada)"
else
    fail "carrinhos de convidado sem expurgo: crescimento ilimitado da base de dados"
fi
if has "$CART_CTRL" "GUEST_ID"; then
    pass "X-Guest-Id validado (formato e tamanho)"
else
    fail "X-Guest-Id aceite sem validação (um header longo rebentava com 500)"
fi

echo "8) Manutenção periódica e estatísticas agregadas no SQL"
if has "$APP_YAML" "maintenance:" \
        && [[ -f backend/src/main/java/mz/norteshopmoz/api/service/MaintenanceCleanup.java ]] \
        && [[ -f backend/src/main/java/mz/norteshopmoz/api/service/OrphanDataCleanup.java ]]; then
    pass "manutenção periódica (sessões e idempotência no Redis + órfãos na BD)"
else
    fail "sem manutenção periódica: chaves órfãs acumulam no Redis/BD"
fi
# ShedLock: com mais de uma réplica, todas correriam as tarefas periódicas em
# paralelo. O lock partilhado na base de dados garante uma só execução por período.
SHEDLOCK_CFG="backend/src/main/java/mz/norteshopmoz/api/config/SchedulerLockConfig.java"
if [[ -f "$SHEDLOCK_CFG" ]] && has "$SHEDLOCK_CFG" "@EnableSchedulerLock" \
        && has "$SHEDLOCK_CFG" "usingDbTime" \
        && [[ -f backend/src/main/resources/db/migration/V7__shedlock.sql ]] \
        && has backend/src/main/java/mz/norteshopmoz/api/service/MaintenanceCleanup.java "@SchedulerLock" \
        && has backend/src/main/java/mz/norteshopmoz/api/service/GuestCartCleanup.java "@SchedulerLock"; then
    pass "agendadores com lock distribuído (ShedLock; uma execução por período entre réplicas)"
else
    fail "agendadores sem lock distribuído (várias réplicas correm a manutenção em paralelo)"
fi
ORDER_REPO="backend/src/main/java/mz/norteshopmoz/api/repository/OrderRepository.java"
ORDER_SVC="backend/src/main/java/mz/norteshopmoz/api/service/OrderService.java"
if has "$ORDER_REPO" "group by" && has "$ORDER_SVC" "salesStats"; then
    pass "estatísticas de vendas agregadas no SQL (sem varrer pedidos em memória)"
else
    fail "estatísticas a somar pedidos em memória (O(n) de memória/latência)"
fi
if [[ -f backend/src/main/resources/db/migration/V3__orders_stats_indexes.sql ]]; then
    pass "índices das agregações (V3) presentes"
else
    fail "sem índices para as agregações do painel"
fi

echo "9) Cache, uploads, healthcheck e CSP"
CACHE_CFG="backend/src/main/java/mz/norteshopmoz/api/config/RedisCacheConfig.java"
# Sem errorHandler próprio o Spring usa o SimpleCacheErrorHandler, que RELANÇA:
# Redis da cache em baixo → todos os endpoints de catálogo respondem 500.
if has "$CACHE_CFG" "CacheErrorHandler" && has "$CACHE_CFG" "implements CachingConfigurer"; then
    pass "cache do catálogo falha aberta (Redis fora não derruba o catálogo)"
else
    fail "cache sem tratamento de erro: uma falha do Redis derruba todo o catálogo (500)"
fi
# Publicar uma imagem de produto falhava com 413: o nginx corta a 1 MB por omissão.
if has "nginx/conf.d/norteshopmoz.conf" "client_max_body_size" \
        && has "nginx/nginx.conf.template" "client_max_body_size"; then
    pass "nginx aceita o upload de imagens (client_max_body_size)"
else
    fail "client_max_body_size em falta no nginx: uploads acima de 1 MB devolvem 413"
fi
# A imagem runtime (eclipse-temurin:21-jre) não traz curl NEM wget: o healthcheck
# ficava sempre a falhar e o deploy preso à espera de UP.
if has "backend/Dockerfile" "curl" \
        && grep -qE 'test: \["CMD", "curl", "-fsS", "http://localhost:8080/actuator/health/liveness"\]' "$PROD"; then
    pass "healthcheck da API com curl instalado na imagem (sem wget inexistente)"
else
    fail "healthcheck da API usa um binário ausente na imagem (contentor sempre unhealthy)"
fi
# Em HTTP (modo IP) o upgrade-insecure-requests reescrevia tudo para https:// e a
# loja ficava inutilizável no browser, sem um único erro no servidor.
PROXY_TS="frontend/src/proxy.ts"
if has "$PROXY_TS" 'isProduction && isHttps ? ["upgrade-insecure-requests"]'; then
    pass "CSP só força HTTPS quando o pedido é HTTPS"
else
    fail "upgrade-insecure-requests incondicional: em modo HTTP a loja deixa de funcionar no browser"
fi
# A cobrança no gateway é uma chamada externa: dentro da transação segurava a
# ligação JDBC e o lock do cupão durante toda a latência do gateway.
if has "$ORDER_SVC" "transactions.execute" && has "$ORDER_SVC" "paymentService.authorize"; then
    pass "cobrança fora da transação de escrita (transação curta para stock/cupão/pedido)"
else
    fail "cobrança dentro da transação: gateway lento esgota o pool e derruba a API"
fi
# A listagem do painel carregava o histórico completo (com itens EAGER) e filtrava
# em memória: memória e latência a crescer sem limite com o número de pedidos.
if has "$ORDER_SVC" "PageRequest.of" && has "$ORDER_REPO" "Page<Order> findByStatus" \
        && lacks "$ORDER_REPO" "findAllByOrderByDateDesc"; then
    pass "listagem de pedidos paginada e filtrada no SQL (não carrega o histórico)"
else
    fail "listagem de pedidos sem paginação no SQL (carrega todos os pedidos para memória)"
fi

echo "10) Quedas evitadas: portas, pool JDBC, alertas e checkout público"
# As portas de db/redis/redis-cache NÃO podem voltar a ser publicadas no host. Se
# outra coisa já ocupar a porta, o Docker reverte o endpoint e o contentor fica a
# correr SEM rede e sem porta — mas "healthy" (o healthcheck corre lá dentro). A
# loja cai e o `docker compose ps` mostra tudo verde. Foi o incidente de agosto
# (nsm-redis-prod contra o Redis do sistema na 6379).
for port in 5432 6379 6380; do
    if grep -qE "^      - \"(127\.0\.0\.1:)?${port}:${port}\"" "$PROD"; then
        fail "docker-compose.prod.yml publica a porta ${port}: um conflito no host deixa o contentor sem rede (loja avariada com tudo 'healthy')"
    else
        pass "porta ${port} não publicada no host (só acessível pela rede do compose)"
    fi
done
# O preflight tem de distinguir "a minha stack já publica a porta" de "outro
# stack publica a porta": no segundo caso o `up -d` reproduz o estado silencioso.
if has scripts/docker-net-check.sh "com.docker.compose.project" \
        && has scripts/docker-net-check.sh "outro stack"; then
    pass "preflight de portas distingue o próprio stack de um stack alheio"
else
    fail "preflight aceita qualquer contentor como dono da porta (falso negativo)"
fi
# Sem dimensionar o pool, o Hikari usa 10 ligações contra 200 threads do Tomcat:
# uma base de dados lenta deixa a loja inteira à espera (e a 500).
if has "$APP_YAML" "hikari:" && has "$APP_YAML" "maximum-pool-size:" \
        && has "$APP_YAML" "connection-timeout:"; then
    pass "pool JDBC dimensionado (não usa os 10 por omissão com 200 threads)"
else
    fail "pool JDBC por omissão (10): a base de dados lenta derruba a API inteira"
fi
# O checkout público passou a resolver cada produto UMA vez (era três ciclos
# sobre os itens, cada um com a sua consulta e a sua ligação ao pool).
if has "$ORDER_SVC" "resolveProduct(item, resolved)"; then
    pass "checkout resolve cada produto uma só vez (N consultas e não ~3N)"
else
    fail "checkout com múltiplas passagens ao catálogo (consultas a multiplicar por pedido)"
fi
# O checkout é público e desconta stock real + envia email para o endereço que o
# cliente indicar: sem travão, um script esgota o catálogo e usa a loja como relay.
THROTTLE="backend/src/main/java/mz/norteshopmoz/api/service/OrderThrottleService.java"
if [[ -f "$THROTTLE" ]] && has "$ORDER_SVC" "orderThrottle.assertAllowed" \
        && has "$ORDER_SVC" "orderThrottle.recordCreated"; then
    pass "checkout público com travão por contacto (stock e abuso de email)"
else
    fail "checkout público sem travão: um script esgota o stock e dispara emails em massa"
fi
# O TTL é definido no MESMO script que faz o INCR (encanamento partilhado em
# RedisCounterThrottle): um INCR seguido de um EXPIRE em chamadas distintas deixa
# — se algo falhar pelo meio — uma chave sem TTL para sempre, e na instância
# `noeviction` essas chaves só crescem até esgotar a memória.
COUNTERS="backend/src/main/java/mz/norteshopmoz/api/config/RedisCounterThrottle.java"
if [[ -f "$COUNTERS" ]] && has "$COUNTERS" "INCR_WINDOW_LUA" && has "$COUNTERS" "PEXPIRE" \
        && has "$THROTTLE" "counters.increment"; then
    pass "contadores com TTL atómico (sem chaves eternas na instância noeviction)"
else
    fail "contadores sem TTL atómico: podem encher a memória do Redis (noeviction)"
fi
# Regras de alerta: a aplicação degrada em vez de morrer (fail-open), por isso
# uma avaria parcial é invisível sem alertas activos.
RULES="monitoring/prometheus/rules/nsm-alerts.yml"
if [[ -f "$RULES" ]] && has monitoring/prometheus/prometheus.yml "rule_files:" \
        && has monitoring/prometheus/prometheus.yml "alertmanagers:"; then
    pass "alertas carregados e encaminhados para o Alertmanager"
else
    fail "sem regras/encaminhamento de alertas: a degradação (fail-open) fica invisível"
fi
if has "$RULES" "probe_success{job=\"nsm-readiness\"}" \
        && has monitoring/prometheus/prometheus.yml "blackbox-exporter"; then
    pass "readiness sondada de fora (a API de pé sem Redis/BD é alertada)"
else
    fail "readiness não monitorizada: 'healthy mas fora da rede' passa despercebido"
fi
if [[ -f monitoring/alertmanager/alertmanager.yml ]] \
        && has monitoring/docker-compose.monitoring.yml "ALERT_WEBHOOK_URL" \
        && has monitoring/docker-compose.monitoring.yml "exec /bin/alertmanager"; then
    pass "Alertmanager com destino obrigatório (não sobe sem para onde avisar)"
else
    fail "Alertmanager sem destino: os alertas disparariam sem avisar ninguém"
fi
# A obrigatoriedade é imposta por um guarda de arranque, e não por `${VAR:?}`:
# o `${…:?}` aborta o `docker compose up` de TODO o ficheiro, mesmo com o perfil
# `alerting` inativo, e quem só quer dashboards deixava de conseguir subir a stack.
if lacks monitoring/docker-compose.monitoring.yml 'ALERT_WEBHOOK_URL:?'; then
    pass "sem \${VAR:?} no compose de monitorização (dashboards não ficam bloqueados)"
else
    fail "\${ALERT_WEBHOOK_URL:?} bloqueia a stack de dashboards (verificado: o compose interpola tudo)"
fi
# `host.docker.internal` só existe automaticamente no Docker Desktop; num VPS
# Linux, sem `extra_hosts`, o Prometheus e os exporters não resolvem o host.
if has monitoring/docker-compose.monitoring.yml "host.docker.internal:host-gateway"; then
    pass "extra_hosts para o host em Linux (Prometheus/exporters resolvem a API)"
else
    fail "sem extra_hosts: no VPS Linux nada em host.docker.internal resolve (up=0 falso)"
fi
# Retenção de pedidos: LIGADA por omissão (730 dias). Sem expurgo a tabela cresce
# sem fim; num VPS único o disco cheio para o PostgreSQL e a loja deixa de aceitar
# pedidos. Só apaga pedidos TERMINAIS antigos — nunca pedidos em curso.
if has "$APP_YAML" 'retention-days: ${ORDERS_RETENTION_DAYS:730}'; then
    pass "expurgo de pedidos ligado por omissão (730 dias, só terminais)"
else
    fail "retenção de pedidos por omissão em falta (a tabela cresce sem fim)"
fi

echo "11) Disco, memória do Redis, email público e CSP"
# Sem limite de logs, o driver json-file cresce sem fim no MESMO disco do
# PostgreSQL. O nginx escreve uma linha por pedido: quando o disco enche, o
# Postgres deixa de escrever WAL e a loja PARA de aceitar pedidos.
if has "$PROD" "x-logging: &default-logging" && has "$PROD" "max-size:" \
        && [[ "$(grep -c 'logging: \*default-logging' "$PROD")" -ge 6 ]]; then
    pass "limite de logs em todos os serviços de produção (disco não enche)"
else
    fail "sem limite de logs: o json-file cresce até encher o disco (o Postgres para de escrever)"
fi
if has "$MON" "x-logging: &default-logging" && has "$MON" "max-size:"; then
    pass "limite de logs na stack de monitorização"
else
    fail "monitorização sem limite de logs (também enche o disco do servidor)"
fi
# /dev/shm de 64 MB faz os workers paralelos do Postgres falharem nas agregações
# do painel — e o erro só aparece com a tabela já grande, ou seja em produção.
if has "$PROD" "shm_size:"; then
    pass "shm_size definido no PostgreSQL (workers paralelos não falham)"
else
    fail "Postgres sem shm_size: consultas paralelas falham com /dev/shm de 64 MB"
fi
# O rate limiter guardava um membro de ZSET por pedido: o balde `safe` (2000/min
# por IP) chegava a ~108 KB por IP, e ~3700 IPs enchiam os 400 MB do Redis de
# estado. Com noeviction isso não descarta, FALHA — deixando de gravar refresh
# tokens e chaves de idempotência. A janela fixa consome O(chaves).
RATELIMITER="backend/src/main/java/mz/norteshopmoz/api/config/RateLimiter.java"
# Só conta se for um comando ACTIVO do script Lua (as palavras aparecem também
# nos comentários a explicar o que foi substituído).
if has "$RATELIMITER" "FIXED_WINDOW_LUA" \
        && grep -qE "redis\.call\('INCR'" "$RATELIMITER" \
        && ! grep -qE "redis\.call\('ZADD'" "$RATELIMITER"; then
    pass "rate limit de janela fixa (memória O(chaves) e não O(limite))"
else
    fail "rate limit com janela deslizante: um scraper com poucos milhares de IPs esgota o Redis noeviction"
fi
# Os endpoints públicos de email (registo, recuperação, reenvio) mandam mensagens
# para o endereço que o PEDIDO indicar: sem travão, queima-se a cota do fornecedor
# (os clientes reais deixam de receber a confirmação do pedido) e a reputação do domínio.
MAIL_THROTTLE="backend/src/main/java/mz/norteshopmoz/api/service/EmailThrottleService.java"
if [[ -f "$MAIL_THROTTLE" ]] && has "$AUTH" "emailThrottle.assertAllowed" \
        && has "$AUTH" "emailThrottle.recordSent"; then
    pass "travão nos emails de endpoints públicos (register/forgot-password/reenvio)"
else
    fail "endpoints públicos de email sem travão: cota do fornecedor e reputação do domínio em risco"
fi
if has "$APP_YAML" "email-throttle:" && has "$APP_YAML" "max-per-address:"; then
    pass "travão de email configurável (por endereço + travão global)"
else
    fail "travão de email sem configuração (limites não ajustáveis por ambiente)"
fi
# Dois cabeçalhos CSP ⇒ o browser aplica a INTERSEÇÃO: uma diretiva em falta num
# deles (a origem da API em connect-src) bloqueava tudo o que o outro permitia.
NGINX_HTTP="nginx/conf.d/norteshopmoz.conf"
# Procura a DIRETIVA ativa (add_header Content-Security-Policy), não a menção:
# o ficheiro explica em comentário porque é que o CSP saiu daqui.
if ! grep -qE '^[[:space:]]*add_header[[:space:]]+Content-Security-Policy' "$NGINX_TPL" \
        && ! grep -qE '^[[:space:]]*add_header[[:space:]]+Content-Security-Policy' "$NGINX_HTTP"; then
    pass "CSP definido num só sítio (middleware do Next) — sem interseção de políticas"
else
    fail "nginx a definir CSP além do Next: o browser aplica a interseção e pode bloquear a API"
fi
# `add_header` numa location substitui os herdados do `server`: as locations de
# estáticos ficavam sem nosniff.
if has "$NGINX_HTTP" "include /etc/nginx/snippets/security-headers.conf;" \
        && has "$NGINX_TPL" "include /etc/nginx/snippets/security-headers.conf;" \
        && [[ -f nginx/snippets/security-headers.conf ]]; then
    pass "cabeçalhos de segurança incluídos nas locations com add_header próprio"
else
    fail "locations de estáticos sem os cabeçalhos de segurança (add_header não é herdado)"
fi
if has "$PROD" "./nginx/snippets:/etc/nginx/snippets:ro"; then
    pass "snippet dos cabeçalhos montado no nginx (o include não falha em runtime)"
else
    fail "snippet não montado: o 'include' deixa o nginx sem arrancar"
fi

echo
if (( FAILED )); then
    echo -e "\033[0;31mVerificação falhou: há invariantes de produção quebradas.\033[0m"
    exit 1
fi
echo -e "\033[0;32mVerificação de robustez de produção: tudo em ordem.\033[0m"
