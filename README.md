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
| `CORS_ALLOWED_ORIGINS` | Origens permitidas (ex.: `https://norteshop.com`) |
| `RESEND_API_KEY`, `RESEND_FROM` | Email transacional |
| `CLOUDINARY_*` | Armazenamento de imagens de produto |
| `GOOGLE_CLIENT_ID`, `FACEBOOK_APP_ID/SECRET` | Login social (opcional) |
| `PAYMENTS_MODE` | `simulated` (omissão) ou `live` |
| `NEXT_PUBLIC_API_BASE_URL` | URL da API consumido pelo frontend |

⚠️ **Em produção não há fallbacks inseguros** — todas as variáveis marcadas como obrigatórias têm de estar definidas.

## 🧪 Testes

```bash
# Backend (requer db :5434 e redis :6381 ativos)
cd backend && mvn test

# Frontend — unitários e E2E
cd frontend
npm run test          # Vitest
npm run test:e2e      # Playwright
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
| Validate Docker Compose | Validação dos ficheiros compose (com `--profile full`) |
| Build & Push Docker | Publica imagens em `ghcr.io/<owner>/norteshopmoz-{api,frontend}` |

## 🚢 Produção

```bash
cp .env.prod.example .env.prod    # preenche TODAS as variáveis obrigatórias
./deploy.sh                       # build + up com docker-compose.prod.yml
```

Serviços: `nginx` (80/443) → `frontend` (:3000) + `api` (:8080) → `db` + `redis`.
A migração HTTPS fica reservada na config do nginx (Certbot).

### Monitorização

```bash
docker compose -f monitoring/docker-compose.monitoring.yml up -d
```

Prometheus recolhe métricas da API, PostgreSQL, Redis, nodes e containers; dashboards disponíveis no Grafana.

### Backups

Scripts em `scripts/`: `backup.sh`, `restore.sh`, `pitr_setup.sh`, `backup_status.sh` e cron jobs prontos em `scripts/cron_jobs/`.

## 🔐 Notas de segurança

- Nunca faças commit de `.env` / `.env.prod` (já estão no `.gitignore`)
- Roda segredos periodicamente — ver [`SECRET_ROTATION.md`](SECRET_ROTATION.md)
- O pipeline bloqueia pushes com segredos detetados (TruffleHog) e vulnerabilidades críticas (Trivy/CodeQL)

---

Feito com ❤️ para Moçambique 🇲🇿
