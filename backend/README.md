# NSM — NorteShopMoz API (Backend)

API REST do e-commerce **NorteShopMoz (NSM)** — plataforma de dropshipping para Moçambique.

Este backend implementa, em **Java 21 + Spring Boot**, o contrato REST `/api/*` que o
frontend Next.js já consome (`frontend/src/lib/repo.ts` é o ponto único de ligação).
Todos os preços são em **Metical (MT)** e o conteúdo é 100% em português.

---

## Stack

| Camada      | Tecnologia                                            |
|-------------|-------------------------------------------------------|
| Framework   | Spring Boot 4.1.0 (Spring Framework 7 / MVC)          |
| Linguagem   | Java 21                                               |
| Base dados  | PostgreSQL 16 (JPA / Hibernate, colunas JSONB)        |
| Cache       | Redis 7 (Spring Cache, TTL 15 min)                    |
| Segurança   | Spring Security + JWT (jjwt 0.12, BCrypt)             |
| Build       | Maven 3.9+ (`mvnw` incluído)                          |
| Infra       | Docker Compose (db + redis + api)                     |

> Nota: o Boot 4 usa **Jackson 3** (`tools.jackson`) para o HTTP e o serializer do
> cache Redis usa **Jackson 2** (`com.fasterxml.jackson`) com `JavaTimeModule` —
> ambos já configurados em `RedisCacheConfig` e `pom.xml`.

---

## Arquitetura

```
backend/src/main/java/mz/norteshopmoz/api/
├── NorteShopMozApiApplication.java   # main class
├── bootstrap/
│   └── DataSeeder.java               # seed do catálogo (catalog.json) + conta admin
├── config/
│   ├── AppProperties.java            # app.jwt.* / app.cors.* / app.mail.* (env vars)
│   ├── RedisCacheConfig.java         # cache Redis + serializer Jackson (jsr310)
│   ├── SecurityConfig.java           # JWT stateless + CORS + rotas públicas/admin
│   ├── ShippingConfig.java           # tabela de províncias (taxa/prazo, envio grátis)
│   └── WebConfig.java                # serve os uploads locais (/uploads/**)
├── domain/                           # entidades JPA
│   ├── Category, Product, ProductSpec, ProductVariant, VariantOption
│   ├── Review, UserAccount, NewsletterSubscriber, AddressBookEntry
│   ├── Favorite, CartItem, UserCart
│   └── Order, OrderItem, OrderAddress, OrderStatus
├── exception/
│   ├── ApiException.java             # erro de negócio (400/401/403/404/409…)
│   └── GlobalExceptionHandler.java   # envelope {"error": "..."} + validação
├── repository/                       # Spring Data JPA
│   ├── Product, Category, Review, User, Order, Address
│   └── Cart, Favorite, Newsletter
├── security/
│   ├── JwtService.java               # gera/valida tokens
│   ├── JwtAuthenticationFilter.java  # lê Authorization: Bearer
│   ├── UserPrincipal.java            # principal autenticado (id, email, fullName, role)
│   └── SessionRevocationService.java # blacklist de sessões no Redis (logout)
├── service/
│   ├── CatalogService.java           # catálogo @Cacheable (Redis), createProduct, reviews
│   ├── ProductQuery / ProductSpecifications.java  # filtros/ordenação/pesquisa
│   ├── OrderService.java             # pedidos (recalcula totais; timeline de estado)
│   ├── OrderIdempotencyService.java  # anti duplo-submit (Idempotency-Key)
│   ├── PaymentService.java           # registo/validação dos métodos de pagamento
│   ├── PaymentGateway.java           # contrato de cobrança (interface extensível)
│   ├── SimulatedPaymentGateway.java  # gateway simulado (PAYMENTS_MODE=simulated)
│   ├── AuthService.java              # registo/login (BCrypt) + verificação/reset
│   ├── CartService / FavoriteService / AddressService / NewsletterService
│   ├── EmailService.java             # Resend (verificação, reset, pedidos, newsletter)
│   └── CloudinaryService.java        # upload de imagens (fallback local em dev)
└── web/
    ├── CatalogController.java        # GET /api/products…, categories, reviews (GET+POST)
    ├── OrderController.java          # /api/orders (guest checkout) + admin
    ├── AuthController.java           # /api/auth/register, /login, /me, verify/reset…
    ├── CartController.java           # /api/cart (token ou X-Guest-Id)
    ├── FavoritesController.java      # /api/favorites
    ├── AddressController.java        # /api/addresses
    ├── NewsletterController.java     # /api/newsletter/subscribe + subscribers
    ├── UploadController.java         # /api/upload (admin; Cloudinary ou local)
    └── dto/                          # ApiResponse, OrderRequest, ProductRequest, …
```

---

## Como correr

### Opção 1 — Docker Compose (recomendado)

```bash
docker compose up -d db redis api
```

Levanta: PostgreSQL (`localhost:5434`), Redis (`localhost:6381`) e a API (`http://localhost:8081`).
Na primeira subida o `DataSeeder` semeia **10 categorias, 44 produtos e 88 avaliações**
a partir de `backend/src/main/resources/seed/catalog.json` (gerado do catálogo real do frontend).

### Opção 2 — Desenvolvimento local

```bash
# 1) Base de dados + Redis
docker compose up -d db redis

# 2) API (Spring Boot)
cd backend
./mvnw spring-boot:run          # ou: mvn spring-boot:run
```

A API fica em `http://localhost:8081` (defina `PORT` para mudar).
Health check: `curl http://localhost:8081/actuator/health`

### Build do jar

```bash
cd backend && mvn -B -DskipTests package
# → target/norteshopmoz-api-0.0.1-SNAPSHOT.jar
```

---

## Configuração (variáveis de ambiente)

| Variável                | Padrão                                         | Descrição                             |
|-------------------------|------------------------------------------------|---------------------------------------|
| `PORT`                  | `8080` (compose: `8081`)                       | Porta HTTP                            |
| `DB_URL`                | `jdbc:postgresql://localhost:5434/norteshopmoz`| URL PostgreSQL                        |
| `DB_USER` / `DB_PASSWORD` | `postgres` / `postgres`                      | Credenciais da base                    |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6381`                       | Ligação Redis                          |
| `JWT_SECRET`            | valor de dev (⚠️ trocar em produção, ≥32 chars)| Chave de assinatura HS256              |
| `JWT_EXPIRATION`        | `604800` (7 dias)                              | Validade do token em segundos          |
| `CORS_ALLOWED_ORIGINS`  | `http://localhost:3000`                        | Origens permitidas (vírgula separa)    |
| `PAYMENTS_MODE`         | `simulated`                                    | Gateway de pagamentos (`simulated`/`live`) |

---

## Contrato da API

Envelope de resposta (igual ao frontend `ApiResponse`):

```json
{ "data": ... }                        // objeto único
{ "data": [...], "meta": { "total": n } }  // listas
{ "error": "mensagem" }                // erros (400/401/404/409/500)
```

### Catálogo — público

**`GET /api/products`** — lista com filtros e ordenação. `meta.total` é sempre o **nº total de correspondências** (mesmo com `limit`).

| Parâmetro   | Tipo      | Descrição                                  |
|-------------|-----------|--------------------------------------------|
| `category`  | string    | slug da categoria (ex.: `telemoveis`)      |
| `q`         | string    | pesquisa por nome/descrição/coleções       |
| `sort`      | string    | `price-asc`, `price-desc`, `rating`, `sold`|
| `featured` / `bestseller` / `isNew` / `deal` | flag | filtros de destaque           |
| `minPrice` / `maxPrice` | decimal | intervalo de preço (MT)          |
| `limit`     | int       | limita o nº de resultados                   |

```bash
curl "http://localhost:8081/api/products?category=telemoveis&sort=price-asc&limit=3"
```

```json
{
  "data": [ { "id": "p-001", "slug": "smartphone-nsm-x10-128gb", "name": "Smartphone NSM X10 · 128 GB",
              "price": 15900.00, "oldPrice": 18500.00, "rating": 4.7, "isNew": true,
              "deliveryDays": [3, 7], "badges": ["OFERTA"], "images": [...], "specs": [...], ... } ],
  "meta": { "total": 44 }
}
```

Com `limit=3` a lista devolve 3 itens mas `meta.total` continua 44.

**`GET /api/products/{slug}`** — detalhe completo de um produto → `{ "data": {...} }` (404 se não existir).

**`GET /api/products/{slug}/reviews`** — avaliações → `{ "data": [ { id, author, rating, date, title, comment, verified } ] }`.

**`GET /api/categories`** — categorias com contagem → `{ "data": [ { slug, name, emoji, image, description, productCount } ] }`.
O `productCount` vem de uma única query `GROUP BY` e o resultado completo (com contagens) fica em cache Redis.

### Autenticação — JWT

**`POST /api/auth/register`** (público) → 201

```json
{ "fullName": "Maria João", "email": "maria@exemplo.co.mz", "password": "segredo123", "phone": "+258 84 000 0000" }
```

**`POST /api/auth/login`** (público) → 200

```json
{ "email": "maria@exemplo.co.mz", "password": "segredo123" }
```

Resposta de ambos: `{ "data": { "token": "<jwt>", "user": { "id", "email", "fullName", "phone" } } }`
(409 se o email já estiver registado; 401 com password errada).

**`GET /api/auth/me`** (autenticado) → perfil `{ "data": { "id", "email", "fullName", "phone" } }`.

> Envie o token como `Authorization: Bearer <jwt>`. Sem token → `401 {"error":"Não autenticado…"}`.

### Pedidos

**`POST /api/orders`** → 201 — **público (guest checkout)**: o checkout do frontend não exige login.
Se vier `Authorization: Bearer`, o pedido fica associado ao utilizador.

**Métodos de pagamento aceites**: pagamento na entrega, transferência bancária,
M-Pesa, e-Mola e cartão Visa/Mastercard (rótulos ou aliases em inglês). Os três
últimos são **pagos online** — o servidor valida os dados (`paymentInfo`) e cobra
no gateway (modo `simulated` por omissão gera uma referência sem cobrar;
`PAYMENTS_MODE=live` para uma implementação real de `PaymentGateway`) — e o
pedido já entra com estado **"Pagamento confirmado"** + `paymentReference`
(ex.: `MP-4F3K9Q2X7Z` ou `CARD-••••1234`). Pagamento na entrega/transferência
continuam a começar em "Pedido recebido" e sem referência.

Os totais são **sempre recalculados no servidor a partir do catálogo** — os valores do cliente são ignorados:

- `subtotal` = Σ preço real × quantidade;
- `discount` = Σ (oldPrice − preço) × quantidade (para itens com desconto);
- `shipping` = **0** se subtotal ≥ 5.000 MT (entrega grátis), senão a taxa da província
  (tabela espelhada de `frontend/src/lib/data/provinces.ts`);
- `total` = subtotal − desconto + envio.

Um item com id/slug fora do catálogo → `400`. O ID do pedido é aleatório de alta entropia
(`NSM-` + 12 caracteres) — hoje o frontend guarda os pedidos em `localStorage`; na API,
pedidos de convidados não aparecem na lista de nenhum utilizador e só são consultáveis por ID.

```json
{
  "items": [ { "productId": "p-001", "slug": "smartphone-nsm-x10-128gb", "name": "Smartphone NSM X10 · 128 GB",
               "image": "https://…", "price": 15900.00, "qty": 1, "variant": "128 GB" } ],
  "subtotal": 15900, "shipping": 0, "discount": 1000, "total": 14900,
  "paymentMethod": "M-Pesa",
  "paymentInfo": { "phone": "+258 84 123 4567" },   // ou { "cardLast4": "1234" } para cartão
  "address": { "fullName": "Maria João", "phone": "+258 84 000 0000", "email": "maria@exemplo.co.mz",
               "address": "Av. Julius Nyerere 1234", "city": "Maputo",
               "province": "Maputo Cidade", "notes": "Ligar antes de entregar" }
}

Resposta: `{ "data": { ..., "status": "Pagamento confirmado", "paymentReference": "MP-4F3K9Q2X7Z" } }`
(M-Pesa/e-Mola exigem `paymentInfo.phone` válido e cartão `paymentInfo.cardLast4` — senão 400.)
```

**`GET /api/orders`** → pedidos do utilizador → `{ "data": [...] }` (autenticado)
**`GET /api/orders/{id}`** → um pedido — **público por ID** (IDs de alta entropia
`NSM-…`): permite acompanhar o estado de um pedido de convidado sem conta.
Pedidos ligados a um utilizador exigem ser o dono (senão 401).

O pedido guarda `status` inicial **"Pedido recebido"** e segue a timeline do frontend:
`Pedido recebido → Pagamento confirmado → Em preparação → Enviado → Em trânsito → Entregue`.

**`PATCH /api/orders/{id}/status`** → transição de estado (**admin apenas**) → `{ "data": { "id", "status", … } }`

```json
{ "status": "Enviado" }
```

- Só avança na ordem da timeline (`Pedido recebido → … → Entregue`); **recuar → 400**.
- Estado fora do enum → 400; pedido inexistente → 404.
- Requer **`Authorization: Bearer <token de admin>`** (role `ADMIN`): cliente → 403, sem token → 401.

**`GET /api/orders/admin/all`** → lista **todos** os pedidos (**admin apenas**), do mais
recente ao mais antigo → `{ "data": [...] }`. Filtro opcional:
`?status=Enviado` (estado inválido → 400). Requer token de admin (cliente → 403,
sem token → 401).

### Avaliações (autenticado)

**`POST /api/products/{slug}/reviews`** → 201 — qualquer cliente com token.

```json
{ "rating": 5, "title": "Excelente!", "comment": "Chegou rápido e funciona perfeitamente." }
```

- `rating` 1–5 (obrigatório), `comment` obrigatório (máx. 600), `title` opcional (máx. 120);
  inválidos → 400.
- O selo **"Compra verificada"** (`verified: true`) é atribuído automaticamente
  se o utilizador já comprou o produto (query sobre os pedidos do utilizador).
- A média/`ratingCount` do produto é atualizada e o cache Redis de reviews/produto é invalidado.
- Sem token → 401. O GET público continua a devolver todas as avaliações (seed + submetidas).

### Newsletter

**`POST /api/newsletter/subscribe`** → 200 — **público**, idempotente por email
(reações ativam subscrições inativas). Email inválido → 400. Envia boas-vindas
via Resend (ignorado em dev sem `RESEND_API_KEY`).

```json
{ "email": "cliente@exemplo.co.mz", "name": "Maria" }
```

**`GET /api/newsletter/subscribers`** → lista de subscritores (recentes primeiro) — **admin apenas** (403/401).

### Endereços (autenticado)

**`GET /api/addresses`** → endereços do utilizador → `{ "data": [...] }`
**`PUT /api/addresses`** → substituição completa (mesmo padrão do carrinho) → `{ "data": [...] }`

```json
[ { "label": "Casa", "fullName": "Maria João", "phone": "+258 84 000 0000",
    "address": "Av. Julius Nyerere 1234", "city": "Maputo", "province": "Maputo Cidade",
    "isDefault": true, "lat": -25.9653, "lng": 32.5892 } ]
```

- Província fora da tabela → 400; normaliza para no máximo um endereço padrão.
- Sem token → 401; a lista é sempre por utilizador (isolamento).

### Favoritos (autenticado)

**`GET /api/favorites`** → lista de IDs de produtos favoritos → `{ "data": ["p-001", …] }`
**`PUT /api/favorites`** → substituição completa → `{ "data": ["p-001", …] }`

```json
{ "productIds": ["p-001", "p-006"] }
```

- IDs repetidos são colapsados; um ID fora do catálogo → **400**.
- Requer **`Authorization: Bearer <token>`** (sem token → 401).
- O frontend resolve os detalhes dos produtos a partir do catálogo (só os IDs são guardados).

### Carrinho (autenticado)

**`GET /api/cart`** → itens do carrinho → `{ "data": [{ productId, slug, name, image, price, oldPrice, qty, variant, freeShipping }] }`
**`PUT /api/cart`** → substituição completa → `{ "data": [...] }`

```json
[{ "productId": "p-001", "qty": 2, "variant": "128 GB" }]
```

- O servidor **recalcula** nome, imagem, preço e `freeShipping` a partir do catálogo
  (como nos pedidos); itens do mesmo produto/variante são colapsados e a
  quantidade é limitada a **99** (e ao stock disponível).
- Produto fora do catálogo → **400**; sem token → **401**.
- Sem sessão, o frontend mantém o carrinho em `localStorage`; ao entrar,
  sincroniza com o servidor (merge e persistência em cada alteração).

### Credenciais de administrador (seed)

```
Email:    admin@norteshopmoz.com
Password: Admin@2026
```

O `DataSeeder` garante a existência da conta (corre sempre, mesmo com catálogo já semeado).

---

## Cache Redis

- Cache ativado via `@Cacheable` em `CatalogService` (produtos, produto, categorias, reviews).
- TTL: **15 minutos**; `disableCachingNullValues()`.
- Chaves: `products::<ProductQuery>`, `product::<slug>`, `categories::all`, `reviews::<productId>`.
- O serializer usa `DefaultTyping.EVERYTHING` + `As.PROPERTY` (hint `@class`) e regista o
  `JavaTimeModule` — necessário para campos `Instant` (ex.: `Review.date`).
- ⚠️ Após atualizar o modelo de dados, limpe o cache: `docker exec nsm-redis redis-cli FLUSHDB`.

---

## Seed de dados

- Fonte: `backend/src/main/resources/seed/catalog.json` — gerado a partir do catálogo
  TypeScript do frontend (`frontend/src/lib/data/products.ts`), garantindo que os slugs
  batem com as páginas estáticas.
- O `DataSeeder` só semeia se a tabela `products` estiver vazia (idempotente).
- Gerar de novo após alterar o catálogo:

```bash
cd frontend
node --input-type=module -e "import { products } from './src/lib/data/products.ts'; import { categories } from './src/lib/data/categories.ts'; import fs from 'node:fs'; fs.writeFileSync('../backend/src/main/resources/seed/catalog.json', JSON.stringify({ categories, products }, null, 1)); console.log('ok:', products.length, 'produtos');"
```

---

## Modelo de dados (resumo)

- **Category** — `slug` (id), `name`, `emoji`, `image`, `description`
- **Product** — `id`, `slug`, `name`, `brand`, `category`, `price`, `oldPrice`, `rating`,
  `ratingCount`, `sold`, `stock`, `images[]`, `shortDescription`, `description[]`,
  `specs[]` (JSONB), `badges[]`, `featured`, `bestseller`, `isNew`, `dealOfDay`,
  `variants[]` (JSONB), `deliveryDays[]` (JSONB), `freeShipping`, `tags[]`
- **Review** — `product` (FK), `author`, `rating`, `date` (Instant), `title`, `comment`, `verified`
- **UserAccount** — `id` (UUID), `email` (único), `password` (BCrypt), `fullName`, `phone`, `role` (`CUSTOMER` | `ADMIN`)
- **Order / OrderItem / OrderAddress** — itens com snapshot de preço/nome/imagem,
  endereço, `paymentMethod`, `status`, `date` (Instant), `paymentReference`
  (referência da cobrança online — null em pagamento na entrega/transferência)
- **NewsletterSubscriber** — `email` (único), `name`, `subscribedAt`, `active`
- **AddressBookEntry** — `userId`, `label`, `fullName`, `phone`, `address`, `city`,
  `province`, `isDefault`, `lat`/`lng` (opcionais), `createdAt`

---

## Integração com o frontend

- `frontend/src/lib/repo.ts` isola todo o acesso a dados: trocar o `repo` local por
  chamadas `fetch` aos endpoints acima é o único passo de ligação.
- As rotas `frontend/src/app/api/*` são contratos REST de referência com o mesmo envelope.
- Exemplo mínimo:

```ts
const res = await fetch(`${API_BASE}/api/products?deal=1`);
const { data } = await res.json();
```

- CORS já configurado para `http://localhost:3000` (alterável via `CORS_ALLOWED_ORIGINS`).

---

## Testes

```bash
cd backend && mvn test        # testes de contexto (Boot 4 starters test incluídos)

# Validação do contrato REST contra uma API a correr:
node backend/scripts/validate-api.mjs
API_BASE=http://localhost:8081 node backend/scripts/validate-api.mjs
```

> O script valida **79 verificações** de ponta a ponta: catálogo (filtros,
> pesquisa, ordenação, limit), categorias, reviews (GET + submissão), JWT
> (registo/login/me), favoritos, carrinho, pedidos (totais recalculados, guest
> checkout, isolamento por utilizador), **pagamentos online** (M-Pesa, e-Mola e
> cartão — referência, estado inicial e validações), transições admin da timeline,
> **newsletter** e **endereços**. Corra-o **duas vezes seguidas** para exercitar a
> leitura do cache Redis na 2ª execução.
>
> ⚠️ Ao alterar o modelo de dados: limpe o cache Redis
> (`docker exec nsm-redis redis-cli FLUSHDB`) e faça `mvn -B -DskipTests package`
> para o jar incluir as alterações antes de o correr.
