# NorteShopMoz

![CI](https://github.com/arnaldojuliao/NorteShopMoz/actions/workflows/ci.yml/badge.svg)

Plataforma de **e-commerce / dropshipping** moderna, totalmente responsiva e otimizada para conversão, feita para clientes de **Moçambique**.

---

## ✨ Funcionalidades

- 🛍️ **Catálogo de produtos** com categorias, slugs amigáveis e imagens (Cloudinary ou armazenamento local)
- 🛒 **Carrinho de compras** para visitantes (armazenado em Redis) e clientes registados
- 👤 **Autenticação JWT** com verificação de email e login social (Google / Facebook)
- 📦 **Checkout para visitantes** (guest checkout) com chaves de idempotência
- 💳 **Pagamentos** em modo `simulated` (sem cobrança real) ou `live` (gateway real)
- 📧 **Email transacional** via Resend (verificação de conta, notificações)
- 🔐 **Segurança**: rate limiting por endpoint, CORS configurável, scans automáticos no CI
- 📊 **Observabilidade**: health checks, métricas Prometheus e dashboards Grafana

## 🛠️ Tecnologias

| Camada | Tecnologia |
|---|---|
| Backend | Java 21 · Spring Boot 4 · Maven |
| Frontend | Next.js 16 · React 19 · Tailwind CSS |
| Base de dados | PostgreSQL 16 |
| Cache / carrinho | Redis 7 |
| Proxy reverso | Nginx |
| Monitorização | Prometheus · Grafana · node/postgres/redis exporters · cAdvisor |
| CI/CD | GitHub Actions → imagens Docker no GHCR |

## 📁 Estrutura do projeto

```
NorteShopMoz/
├── backend/                  # API Spring Boot (Java 21)
│   └── src/main/java/mz/norteshopmoz/api/
├── frontend/                 # Loja Next.js 16 (App Router)
├── nginx/                    # Configuração do proxy reverso
├── monitoring/               # Stack Prometheus + Grafana
├── scripts/                  # Backup, restore, PITR, cron jobs
├── docker-compose.yml        # Desenvolvimento (db + redis; api com profile "full")
├── docker-compose.prod.yml   # Produção (api + frontend + nginx)
├── docker-compose.local-prod.yml
├── deploy.sh                 # Deploy em produção
└── .github/workflows/ci.yml  # Pipeline de CI/CD
```

## 🚀 Começar (desenvolvimento)

### Pré-requisitos

- JDK 21+ e Maven (`mvn -v`)
- Node.js 20+ e npm
- Docker e Docker Compose

### 1. Infraestrutura (PostgreSQL + Redis)

```bash
docker compose up -d          # sobe db (:5434) e redis (:6381)
cp .env.example .env          # ajusta as variáveis se necessário
```

> As portas locais alinham-se com os valores por omissão do backend:
> Postgres `5434` · Redis `6381`.
>
> Depois de subir a stack (sobretudo após um reboot da máquina ou do Docker),
> confirme que os contentores ficaram **ligados à rede** — um contentor pode
> ficar a correr sem rede e continuar a dizer `healthy`: `./scripts/docker-net-check.sh`.

### 2. Backend (porta 8080)

```bash
cd backend
mvn spring-boot:run           # http://localhost:8080
```

Documentação de saúde/métricas: `/actuator/health` · `/actuator/prometheus`

### 3. Frontend (porta 3000)

```bash
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

Alternativa — subir tudo com Docker:

```bash
docker compose --profile full up -d --build
```

## ⚙️ Variáveis de ambiente

Copia `.env.example` → `.env` (dev) ou `.env.prod.example` → `.env.prod` (produção).
As mais importantes:

| Variável | Descrição |
|---|---|
| `DB_URL`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Ligação ao PostgreSQL |
| `JWT_SECRET` | Segredo dos tokens (**mín. 32 caracteres**) |
| `CORS_ALLOWED_ORIGINS` | Origens permitidas (ex.: `https://norteshop.com`). Em dev inclua **as duas** formas do host local (`http://localhost:3000` **e** `http://127.0.0.1:3000`) — ver [Resolução de problemas](#-resolução-de-problemas) |
| `RESEND_API_KEY`, `RESEND_FROM` | Email transacional. Em produção o `RESEND_FROM` **tem de usar um domínio verificado** no Resend — `…@resend.dev` é o domínio de teste e só entrega ao dono da conta (os clientes não recebem confirmações). O arranque em `prod` avisa se detetar `resend.dev` |
| `CLOUDINARY_*` | Armazenamento de imagens de produto |
| `GOOGLE_CLIENT_ID`, `FACEBOOK_APP_ID/SECRET` | Login social (opcional). O `GOOGLE_CLIENT_SECRET` **não** é usado (a validação é por ID token/`tokeninfo`) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_FACEBOOK_APP_ID` | Login social no browser (**build time**). Têm de ser **iguais** a `GOOGLE_CLIENT_ID`/`FACEBOOK_APP_ID`: o backend valida o `aud` do token do Google contra o seu Client ID, por isso um ID diferente (ou um cliente apagado no Google Cloud) faz o login falhar |
| `PAYMENTS_MODE` | `simulated` (omissão) ou `live` |
| `NEXT_PUBLIC_API_BASE_URL` | URL da API consumido pelo frontend |
| `APP_COOKIE_SECURE` | Cookies `Secure` (obrigatório `true` com HTTPS; `false` só enquanto a loja servir HTTP) |
| `APP_DOMAIN` | Domínio público do TLS. Se não for definido é derivado de `APP_BASE_URL` |
| `CERTBOT_CERTS`, `CERTBOT_WWW` | Pastas dos certificados e do webroot do certbot (por omissão `./certbot/conf` e `./certbot/www`) |
| `NGINX_CONF` | Conf do nginx a montar. Por omissão a HTTP (`./nginx/conf.d/norteshopmoz.conf`); com HTTPS o `deploy.sh` gera-a de `nginx/nginx.conf.template` |
| `SESSION_IDLE_TIMEOUT_MINUTES` | Inatividade máxima de uma sessão, imposta pelo servidor (Redis) |
| `DB_POOL_SIZE` | Ligações do pool JDBC (omissão **20**; o Hikari usava 10 contra 200 threads do Tomcat — uma base de dados lenta deixava a loja inteira à espera) |
| `DB_POOL_MIN_IDLE`, `DB_POOL_CONNECTION_TIMEOUT_MS` | Ligações mínimas (5) e espera máxima por uma ligação (10 s) |
| `REDIS_TIMEOUT` | Timeout de cada comando ao Redis (omissão **1s**); é o custo por chamada enquanto o Redis estiver pendurado |
| `ORDERS_MAX_PER_CONTACT`, `ORDERS_CONTACT_WINDOW_MINUTES` | Teto de pedidos por contacto (email/telefone) e janela — protege o stock e o email sem punir CGNAT |
| `ORDERS_MAX_GLOBAL_PER_HOUR` | Travão global de anomalia (pedidos criados por hora) |
| `ORDERS_RETENTION_DAYS` | Expurgo de pedidos terminais mais antigos que N dias (omissão **730**; **0 = desligado**; nunca apaga pedidos em curso) |
| `BACKUP_DIR` | Destino dos dumps (pré-deploy e os do cron) |
| `BACKUP_S3_BUCKET` / `OFFSITE_BACKUP_CMD` | Destino de backup **off-site** — o `deploy.sh` só avança depois de confirmar uma cópia **fora do VPS** (um dump só no host que pode falhar não é backup). Forçar sem ele (não recomendado): `SKIP_OFFSITE_BACKUP=1` |
| `GRAFANA_ADMIN_PASSWORD` | Password do Grafana (obrigatória desde que a stack de monitorização fechou as portas) |
| `ALERT_WEBHOOK_URL` | Destino das notificações de alerta (qualquer webhook). **Obrigatório** para subir o Alertmanager (`--profile alerting`) |

⚠️ **Em produção não há fallbacks inseguros** — todas as variáveis marcadas como obrigatórias têm de estar definidas.

## 🧪 Testes

```bash
# Backend (requer db :5434 e redis :6381 ativos)
cd backend && mvn test

# Frontend — unitários e E2E
cd frontend
npm run test          # Vitest
npm run test:e2e      # Playwright

# Invariantes de produção (config, não código)
./scripts/hardening-check.sh
```

## 🔄 CI/CD

O pipeline (`.github/workflows/ci.yml`) corre em cada push/PR para `main`/`develop`:

| Job | O que faz |
|---|---|
| Backend – Test & Build | `mvn test` + package com Postgres/Redis reais |
| Frontend – Test & Build | Lint + Vitest + build Next.js |
| CodeQL (java/javascript) | Análise estática de segurança |
| Secret Scanning | TruffleHog no histórico completo |
| Security Scans | Trivy + OWASP Dependency Check → GitHub Security |
| Validate Docker Compose | Validação dos ficheiros compose (com `--profile full`) + `scripts/hardening-check.sh` |
| Build & Push Docker | Publica imagens em `ghcr.io/<owner>/norteshopmoz-{api,frontend}` |

## 🚢 Produção

```bash
cp .env.prod.example .env.prod    # preenche TODAS as variáveis obrigatórias
./deploy.sh                       # build + backup + up (docker-compose.prod.yml)
```

Serviços: `nginx` (80/443) → `frontend` (:3000) + `api` (:8080) → `db` + `redis`
(estado) + `redis-cache` (cache, `allkeys-lru`).

### Deploy na Vercel

A loja Next.js vive em `frontend/`, mas o projeto da Vercel tem a **raiz do
repositório** como Root Directory. O Root Directory existe só no painel (não é
configurável por `vercel.json` — o schema oficial não tem `rootDirectory`, e o
próprio builder do Next da Vercel assume em comentário que essa definição «can't
be triggered with vercel.json»), por isso o `vercel.json` da raiz traduz o que
ele faria:

| Campo | Porquê |
|---|---|
| `framework: nextjs` | sem `package.json` na raiz a deteção cairia em «Other» e o builder do Next não seria usado (perdia-se o SSR e o middleware) |
| `installCommand` → `scripts/vercel-install.sh` | instala as dependências de `frontend/` e expõe `next` na raiz — o builder resolve-o a partir do Root Directory e aborta com `NEXT_NO_VERSION` se não o encontrar |
| `buildCommand` → `scripts/vercel-build.sh` | corre o build dentro de `frontend/` |
| `outputDirectory: frontend/.next` | o builder lê os artefactos (e o `public/` que fica ao lado deles) nesse caminho |

Se o Root Directory passar a estar definido como `frontend` no painel, este
`vercel.json` deixa de ser lido (fica fora do Root Directory) e pode ser removido
com os dois scripts.

As variáveis públicas (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_APP_URL`) têm de existir como env vars do projeto na Vercel: sem
elas o bundle cai no `http://localhost:8081` por omissão.

### Disco e registos

Todos os serviços têm limite de log (`max-size: 10m`, `max-file: 5` → 50 MB máx.
por contentor). O driver `json-file` do Docker **não tem limite por omissão**, e o
nginx escreve uma linha por pedido: a ~10 req/s são ~170 MB/dia no mesmo disco do
`pgdata` e dos backups. Quando o disco enche, o PostgreSQL não consegue escrever
WAL e a loja deixa de aceitar pedidos — é a avaria em que tudo *parece* bem até
não dar para vender. O alerta `NsmDiscoACurtas` cobre-o, mas não substitui o teto.

O PostgreSQL tem `shm_size: 256m`: com o valor por omissão (64 MB) os workers
paralelos falham em consultas maiores.

O `deploy.sh` falha cedo em vez de deixar uma configuração incoerente passar:
valida as variáveis críticas, **verifica se as portas publicadas estão livres**
(uma porta ocupada faz o Docker arrancar o contentor sem rede — ver
[Resolução de problemas](#-resolução-de-problemas); escape: `SKIP_PORT_CHECK=1`),
exige a conf SSL do nginx quando `APP_BASE_URL` é `https://` (ver abaixo), faz um
**dump pré-deploy** da base de dados e espera por cada serviço com teto de tempo —
antes, um `until … sleep` sem limite pendurava o deploy quando o Redis estava em
baixo. No fim, avisa se o `/actuator/health/readiness` ficar DOWN (a API não
alcança o Redis/BD e fica a degradar).

### HTTPS

O backend recusa arrancar com `APP_COOKIE_SECURE=true` e `APP_BASE_URL` não-https
(os cookies `Secure` são descartados pelo browser e o login falhava em silêncio).
Para servir HTTPS:

```bash
# 1. emissão dos certificados (certbot) em ./certbot/conf (já montados no compose)
certbot certonly --webroot -w ./certbot/www -d loja.exemplo.com
# 2. deploy — o domínio sai daqui e não de um valor fixo na conf do nginx
APP_DOMAIN=loja.exemplo.com ./deploy.sh prod
```

O `deploy.sh`** valida os certificados** (`fullchain.pem`/`privkey.pem`), renderiza
`nginx/nginx.conf.template` (substituindo `${APP_DOMAIN}`) para
`nginx/.generated/default.conf` e monta-o. A conf SSL deixou de ter domínio fixo:
antes apontava para `norteshopmoz.com` e, com outro domínio, o nginx não arrancava.

### Monitorização

```bash
# Dashboards
GRAFANA_ADMIN_PASSWORD='...' docker compose -f monitoring/docker-compose.monitoring.yml up -d

# + alertas (recomendado em produção): qualquer webhook serve
# (Slack, Discord, ntfy.sh, endpoint próprio)
GRAFANA_ADMIN_PASSWORD='...' ALERT_WEBHOOK_URL='https://…' \
  docker compose -f monitoring/docker-compose.monitoring.yml --profile alerting up -d
```

Prometheus recolhe métricas da API, PostgreSQL, Redis, nodes e containers. As
portas do Grafana/Prometheus/exporters ficam **ligadas a 127.0.0.1** (acesso por
túnel SSH) e o Prometheus corre sem admin API — antes estavam abertas na internet,
com a password `admin123` por omissão.

#### Alertas (porque é que isto não é opcional)

A aplicação foi desenhada para **degradar em vez de cair**: o rate limit, a
idempotência, o idle de sessão e a cache do catálogo falham abertos, a *liveness*
não vê o Redis e o frontend cai para os dados locais. É a decisão certa para uma
loja — mas torna uma **avaria parcial invisível**. Sem alertas, um Redis em baixo
ou um pool de base de dados saturado ficam à espera de que alguém olhe para um
dashboard.

As regras em `monitoring/prometheus/rules/nsm-alerts.yml` cobrem os estados em que
a loja «parece viva mas não vende»:

| Alerta | O que significa |
|---|---|
| `NsmApiDown` | A API não responde ao Prometheus |
| `NsmApiDegradada` | **A API está de pé mas não alcança o Redis/BD** — vende com as proteções desligadas (a sonda de *readiness*, via blackbox-exporter, é a única forma de o ver: o `/actuator/prometheus` não expõe a saúde das dependências) |
| `NsmTaxaDeErros5xx`, `NsmLatenciaAlta` | Erros ou lentidão sustentados |
| `NsmPoolJdbcSaturado`, `NsmPoolJdbcTimeouts` | Threads à espera de ligação à base de dados (a causa clássica de a API inteira parar) |
| `NsmBaseDeDadosIndisponivel`, `NsmRedisIndisponivel`, `NsmRedisSemMemoria` | Dependências em baixo ou sem memória (`noeviction`) |
| `NsmHeapJvmAlto`, `NsmDiscoACurtas`, `NsmContentorReinicia` | Recursos do servidor |

O Alertmanager (`monitoring/alertmanager/`) é o que avisa alguém: sem
`ALERT_WEBHOOK_URL` **não arranca** — uma stack de alertas que sobe sem destino dá
uma falsa sensação de estar a monitorizar.

> Os serviços que falam com o host usam `extra_hosts: host.docker.internal:host-gateway`:
> em Linux o nome só existe com esse mapeamento (no Docker Desktop é automático).
> Sem ele, o Prometheus não consegue recolher nada e todos os alertas disparam em
> falso («a API em baixo» com a API boa).

### Backups

**Instale os cron jobs** — o modelo em `scripts/cron_jobs` não é instalado por
ninguém, e sem isto não há backups automáticos:

```bash
sudo ./scripts/install-backup-cron.sh   # /etc/cron.d/norteshop-backups
sudo ./scripts/backup.sh full 30        # teste imediato
./scripts/backup.sh --verify-only       # confirma que o último dump abre e tem conteúdo
```

O `backup.sh` corre o `pg_dump` **dentro do contentor** (`MODE=docker`), por isso
não precisa de cliente PostgreSQL nem de password no host. Também disponíveis:
`restore.sh`, `pitr_setup.sh`, `backup_status.sh`.

### Verificação de robustez

```bash
./scripts/hardening-check.sh   # corre também no CI
```

Falha se alguma invariante de produção for revertida: monitorização exposta,
healthcheck da API dependente do Redis, HTTPS sem conf SSL, ausência de backup
pré-deploy ou perda do idle timeout de sessão.

## 🩺 Resolução de problemas

### O login falha com "Não foi possível ligar ao servidor"

Essa mensagem significa sempre a mesma coisa: **o browser não conseguiu ler a
resposta da API** (não diz nada sobre a internet do cliente). Há duas causas
frequentes, e a segunda esconde-se atrás da primeira.

**1. A origem da loja não está em `CORS_ALLOWED_ORIGINS`.**

O catálogo é renderizado no servidor Next (que não sofre CORS), por isso a loja
aparece **normal e completa** — só as chamadas feitas *pelo browser* (login,
registo, carrinho, checkout) falham. O browser bloqueia o pedido e reporta-o como
falha de rede, o que torna este caso muito difícil de adivinhar pelo sintoma.

```bash
# Se a 2.ª linha não aparecer, a origem está a ser bloqueada:
curl -s -o /dev/null -D - -H 'Origin: http://127.0.0.1:3000' \
  'http://localhost:8080/api/products?limit=1' | grep -i 'access-control-allow-origin'
```

Correção: acrescentar a origem usada (exatamente como aparece na barra de
endereços, incluindo `localhost` vs `127.0.0.1`) a `CORS_ALLOWED_ORIGINS` e
recriar o contentor da API (`docker compose --profile full up -d --force-recreate api`)
— a variável é lida no arranque do contentor, não em cada pedido.

**2. A API está a responder 500 a tudo (Redis inacessível).** Ver o ponto seguinte.

### A API responde 500 em todos os pedidos e o `/actuator/health` fica `DOWN`

Com `Failed to resolve 'redis'` nos logs (`docker logs nsm-api`), o contentor do
Redis está **a correr sem endpoint de rede**: continua `Up (healthy)` — o
healthcheck corre *dentro* do contentor — e responde a um `PING` local, mas já
não está ligado à rede do compose, não tem o alias `redis` e a porta publicada
fica fechada no host. Para os vizinhos, o serviço simplesmente desapareceu.

A origem é o Docker falhar o mapeamento da porta no arranque do contentor e
**reverter o endpoint** (o contentor fica a correr «saudável mas invisível»):

```
failed to set up container networking: driver failed programming external
connectivity on endpoint nsm-redis (...): failed to bind host port
0.0.0.0:6381/tcp: address already in use
```

Muito típico quando um outro processo já tem a porta (em **21 de agosto** foi
assim: o `nsm-redis-prod` a tentar a `127.0.0.1:6379`, já ocupada pelo Redis do
sistema) ou quando dois arranques do mesmo contentor se sobrepõem. Note que a
porta ocupada **impede também** que o contentor seja exposto — o serviço não fica
só sem DNS interno.

> **Em produção esta classe de falha já não existe**: o `docker-compose.prod.yml`
> não publica portas para `db`, `redis` e `redis-cache` — a API chega-lhes pela
> rede do compose (`db:5432`, `redis:6379`, `redis-cache:6379`). Nada precisava
> dessas portas no host; publicá-las era só uma forma de deixar a loja dependente
> de uma porta estar livre. O `deploy.sh` continua a verificar as portas que
> **restam** (`127.0.0.1:8080` da API e `80`/`443` do nginx) e o `--preflight`
> distingue «a nossa stack já a publica» (re-deploy normal, ✔) de «outro stack
> publica a mesma porta» (✘ — o contentor arrancaria sem rede).

```bash
# Deteção e reparação automáticas (rede, alias e portas publicadas):
./scripts/docker-net-check.sh              # 1 linha por contentor: ✔ ou ✘
./scripts/docker-net-check.sh --fix        # reconecta com o alias do serviço (sem perder dados)
./scripts/docker-net-check.sh --preflight  # antes do 'up': alguma porta do compose está ocupada?

# Equivalente manual — diagnóstico:
docker exec nsm-api getent hosts redis
docker network inspect norteshopmoz_default \
  --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{println}}{{end}}'
docker port nsm-redis                      # vazio = a porta publicada não foi programada

# Equivalente manual — correção sem perder o estado do Redis (rate limit, sessões):
docker network connect --alias redis norteshopmoz_default nsm-redis

# Alternativa (recria o contentor, perde o conteúdo em memória do Redis):
docker compose --profile full up -d --force-recreate redis
```

O `--alias redis` é o ponto essencial: sem ele o contentor fica na rede mas o nome
configurado em `REDIS_HOST=redis` continua por resolver.

A API também **denuncia isto sozinha**: no arranque (e a cada minuto,
`REDIS_PROBE_INTERVAL_MS`) o `RedisConnectivityProbe` escreve um `ERROR` com o
diagnóstico separado por causa — «o nome `redis` não se resolve» (contentor fora
da rede, com as instruções de correção) ou «resolve mas não aceita ligações»
(serviço parado) — e avisa que a loja ficou em modo degradado. Sem esta sonda, um
Redis inacessível não produzia nenhum erro no arranque: só degradação silenciosa.

> Se for preciso perceber *o que* ocupou a porta, o daemon do Docker corre com
> `log-level: error` (`/var/snap/docker/current/config/daemon.json`), por isso os
> arranques bem-sucedidos não ficam registados: suba o nível para `warn` ou `info`
> antes de reproduzir o problema.

> Note-se que a API **deve** degradar em vez de morrer sem Redis: o rate limit, a
> idempotência e o idle de sessão falham abertos (com aviso) e o `/actuator/health`
> de *readiness* reporta o serviço em baixo para o orquestrador — assim o
> orquestrador pára de enviar tráfego em vez de servir 500. Se um blip do Redis
> conseguir derrubar o login ou o catálogo, é uma regressão: o CI cobre-a em
> `RateLimitFilterTest`/`RateLimiterTest` e o `./scripts/hardening-check.sh`
> verifica que a cache do catálogo também falha aberta.

### `docker compose build` falha com `TLS handshake timeout` ou `failed to resolve source metadata`

É o **daemon** do Docker a tentar chegar ao Docker Hub sem proxy: o daemon não lê
as variáveis `HTTP(S)_PROXY` do teu shell (as dos contentores, essas, estão no
`docker-compose.yml`). Numa rede com saída forçada por proxy:

```bash
sudo systemctl edit docker     # Environment="HTTP_PROXY=..." "HTTPS_PROXY=..." "NO_PROXY=localhost,127.0.0.1,db,redis,api"
sudo systemctl restart docker  # reinicia os contentores
```

Enquanto isso não estiver resolvido, o código da API pode ser actualizado sem
rede: o jar é compilado no host (as dependências já estão em `~/.m2`) e injetado
na imagem que já existe (que traz o `curl`, o utilizador `spring`, o
`ENTRYPOINT` e o `HEALTHCHECK`), sem puxar nada do Docker Hub.

```dockerfile
# backend/Dockerfile.prebuilt (temporário)
FROM norteshopmoz-api:latest
USER root
COPY --chown=spring:spring target/norteshopmoz-api-*.jar /app/app.jar
USER spring
```

```bash
cd backend && mvn -q -B -DskipTests package && cd ..
docker build -f backend/Dockerfile.prebuilt -t norteshopmoz-api:patched backend
docker tag norteshopmoz-api:patched norteshopmoz-api:latest
docker compose --profile full up -d --force-recreate api
curl -s localhost:8080/actuator/health          # {"status":"UP"}
```

O contentor recriado mostra o jar novo — o `/api/payments/methods` (endpoint que
só existe nas versões recentes) serve de teste rápido de que a versão em execução
é a que se acabou de compilar.

## 🔐 Notas de segurança

- Nunca faças commit de `.env` / `.env.prod` (já estão no `.gitignore`)
- Roda segredos periodicamente — ver [`SECRET_ROTATION.md`](SECRET_ROTATION.md)
- O pipeline bloqueia pushes com segredos detectados (TruffleHog) e vulnerabilidades críticas (Trivy/CodeQL)
- **O checkout é público** (`POST /api/orders`, aceita convidados, sem CSRF). Cada
  pedido desconta stock real e envia um email para o endereço indicado pelo
  cliente. O `OrderThrottleService` trava por **contacto** (email/telefone) e por
  janela global — deliberadamente **não** por IP, porque em redes móveis
  moçambicanas (CGNAT) milhares de clientes partilham o mesmo endereço e um limite
  apertado por IP bloquearia vendas legítimas. Só contam pedidos **criados**
  (tentativas falhadas não gastam quota) e, com o Redis em baixo, o travão falha
  aberto (o checkout nunca é fechado por causa dele).
- **Os endereços de email públicos também têm travão** (`MAIL_MAX_PER_ADDRESS`,
  3/hora por endereço; `MAIL_MAX_GLOBAL_PER_HOUR`, 500/hora na loja).
  `POST /api/auth/register`, `/forgot-password` e `/resend-verification` enviam
  email para um endereço que o **pedido** indica, sem exigir conta: sem isto, uma
  lista de endereços queima a cota do fornecedor (e os clientes reais deixam de
  receber a confirmação do pedido), suja a reputação do domínio e enche a tabela
  de utilizadores de lixo. Só contam envios que **acontecem** — e o limite por IP
  sozinho não serve, porque o balde `auth` é por IP+path e em CGNAT esse IP é
  partilhado. Desligar só com `MAIL_THROTTLE_ENABLED=false`.
- **O rate limit é de janela fixa** (uma chave por balde, com `INCR`+`PEXPIRE` no
  mesmo script Lua). Era de janela deslizante, com **um membro de ZSET por
  pedido**: o balde `safe` (2000 pedidos/min por IP) chegava a 161 KB de memória
  por IP — alguns milhares de IPs enchiam os 400 MB do Redis de estado, que corre
  `noeviction`, e a partir daí *todas* as escritas falhavam (refresh tokens
  expulsos, idempotência perdida, proteções desligadas). Medido: 2000 pedidos no
  mesmo balde passaram de **161 KB para 48 bytes** (96 B no contentor, constante).
  Um *scraper* com milhares de IPs já não derruba a loja pelas próprias defesas.
- **O CSP vive num só sítio** — o middleware do Next (`frontend/src/proxy.ts`).
  O nginx define os restantes cabeçalhos via `nginx/snippets/security-headers.conf`
  (que é incluído em cada `location` com `add_header` próprio, porque no nginx uma
  `location` que declara um `add_header` deixa de herdar todos os do `server` —
  era o caso das locations de estáticos, que ficavam sem `nosniff`). Dois
  cabeçalhos CSP fazem o browser aplicar a **interseção** das políticas: uma
  diretiva em falta num deles (`connect-src` com a origem da API) bloqueia
  recursos que o outro permitia — a loja aparecia e o login falhava.
- **Os pedidos acumulam-se para sempre.** Sem expurgo, a tabela cresce
  indefinidamente e num VPS único o disco cheio para o PostgreSQL (a loja deixa de
  aceitar pedidos). Por omissão `ORDERS_RETENTION_DAYS=730` (~2 anos): apaga apenas
  pedidos **terminais** (entregues/cancelados) mais antigos do que N dias, numa
  transação, com WARN no log. `0` desliga o expurgo (mantém todo o histórico) —
  para quem tenha obrigações de conservação (fiscais/contabilidade).

---

Feito com ❤️ para Moçambique 🇲🇿
