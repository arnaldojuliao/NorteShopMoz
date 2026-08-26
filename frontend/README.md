# NSM · NorteShopMoz 🛍️🇲🇿

Plataforma de **e-commerce / dropshipping** moderna, totalmente responsiva e
otimizada para conversão, feita para clientes de **Moçambique**.

> Compras simples, seguras e acessíveis.

## Stack

| Camada        | Tecnologia                                         |
| ------------- | -------------------------------------------------- |
| Frontend      | Next.js 16 (App Router) · React 19 · TypeScript    |
| Estilos       | Tailwind CSS v4 · Design System NSM próprio        |
| Dados (fase 1)| Dados mock em `src/lib/data` (prontos para trocar) |
| API (fase 2)  | Java · Spring Boot · REST (ver secção abaixo)      |
| BD / Cache    | PostgreSQL · Redis (planeado)                      |

## Começar

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # build de produção (SSG para produtos/categorias)
npm run start      # servidor de produção
npm run lint       # ESLint
npm test           # Vitest (unitários em src/lib/*.test.ts)
```

## O que está implementado

- **Home page completa**: hero carousel (autoplay + navegação manual), barra
  de benefícios, *Ofertas de hoje* com contador dinâmico, categorias com
  scroll horizontal no mobile, produtos em destaque, mais vendidos,
  novidades, *Você também pode gostar* (carousel), newsletter e footer.
- **Páginas internas**: produto (galeria, variantes, tabs com avaliações
  submetidas por clientes, JSON-LD), categoria (filtros + ordenação), pesquisa,
  carrinho, checkout com os 5 métodos de pagamento moçambicanos (pagamento na
  entrega, transferência, M-Pesa, e-Mola, cartão — os 3 últimos simulados em dev),
  área de conta (perfil, pedidos, favoritos, endereços sincronizados, estado dos
  pedidos) e autenticação real (JWT).
- **Design system**: `Button`, `Input`, `Badge`, `Rating`, `Price`,
  `ProductCard`, `Carousel`, `Modal`, `Dropdown`, `Skeleton`, `Breadcrumbs`,
  etc. — todos em `src/components`.
- **Performance**: SSG, `next/image` (AVIF/WebP, responsive), lazy loading,
  skeleton loading, zero bibliotecas pesadas, animações CSS leves.
- **SEO**: metadata dinâmica, Open Graph, sitemap, robots, manifest,
  dados estruturados (schema.org) nos produtos.

## Ligação ao backend Spring Boot

A camada de dados está isolada em **`src/lib/repo.ts`** — o **único** ponto
de acesso. Desde a fase 2, cada método do `repo` é **async e API-first**:

- Tenta primeiro a API REST do backend (`GET /api/products`, `/api/categories`,
  `/api/products/{slug}`, etc., envelope `{ data, meta }`);
- **Fallback automático** para os dados locais (`src/lib/data`) se a API
  estiver indisponível (rede, timeout ou HTTP ≥ 400) — a loja nunca quebra;
- Cliente HTTP em `src/lib/api.ts`: timeout 4s, cache em memória (TTL 60s)
  e janela de indisponibilidade de 30s para não acumular timeouts em cascata.

**Configuração:**

```bash
# .env.local (padrão: http://localhost:8081)
NEXT_PUBLIC_API_BASE_URL=http://localhost:8081
```

> O CORS do backend já permite `http://localhost:3000` (variável
> `CORS_ALLOWED_ORIGINS` no `docker-compose`). Nas páginas SSG, os dados
> são obtidos da API durante o `next build` (fallback local se estiver em baixo).

**Pedidos** — o checkout envia `POST /api/orders` (guest checkout) e guarda o
pedido devolvido pelo servidor; a página de conta consulta o estado real por ID
(`GET /api/orders/{id}`, público por ID de alta entropia). Rotas proxy same-origin:
`POST /api/orders`, `GET /api/orders/[id]`, `PATCH /api/orders/[id]/status`
(admin — encaminha o `Authorization`; só avança na timeline, 400 ao recuar) e
`GET /api/admin/orders` (lista admin de todos os pedidos, com filtro `?status=`).

**Pagamentos online (M-Pesa, e-Mola, cartão)** — ativos no checkout com dados
por método (telemóvel para carteiras móveis; número/validade/CVC para cartão,
validados no navegador). O servidor revalida, cobra no gateway (em modo
`simulated` por omissão gera uma referência sem cobrar; `PAYMENTS_MODE=live`
para gateway real) e os pedidos pagos online já entram em
“Pagamento confirmado” com `paymentReference`.

**Painel de administração** — `frontend/src/app/admin/page.tsx` (`/admin`):
login com conta ADMIN (o `/entrar` guarda o token JWT em `localStorage`;
utilizadores ADMIN vão diretos ao painel), filtros por estado com contagens,
lista de pedidos (cliente, província, pagamento, totais) e botão **"Avançar
estado"** que chama o `PATCH` — o estado atualiza na lista sem recarregar.

**Autenticação (JWT)** — `AuthContext` (`/entrar` faz login/registo reais via
`POST /api/auth/login|register`; o token vive em `nsm:token` e o perfil é
confirmado no arranque via `GET /api/auth/me`). Com sessão ativa: os pedidos
ficam ligados à conta (`Authorization` no POST/GET de pedidos), a página de
conta mostra os pedidos reais (`GET /api/orders` com fallback local) e os
favoritos sincronizam com `GET/PUT /api/favorites` (merge no login, persistência
em cada toggle; sem sessão ficam só em `localStorage`). O header mostra o nome
do utilizador; administradores vão diretos ao `/admin`.

**Carrinho sincronizado** — com sessão (token) ou identidade de convidado
(`X-Guest-Id`), o carrinho é guardado no servidor (`GET/PUT /api/cart`) com
merge no arranque; sem ligação fica em `localStorage` e sincroniza depois.

**Newsletter** — a subscrição da home liga ao backend (`POST
/api/newsletter/subscribe`, idempotente por email) e envia boas-vindas via
Resend; a lista de subscritores está no painel admin (`/api/newsletter/subscribers`).

**Avaliações** — clientes autenticados avaliam produtos (aba “Avaliações” da
página de produto; `POST /api/products/{slug}/reviews`). O selo “Compra
verificada” é atribuído automaticamente se o cliente já comprou o produto.

**Endereços de entrega** — sincronizados com o servidor quando há sessão
(`GET/PUT /api/addresses`); sem sessão ficam apenas em `localStorage`.

**Testes** — `npm test` corre Vitest (**16 testes**: format, utils e shipping,
incluindo o fallback API↔local da config de envio). O contrato REST é validado
de ponta a ponta pelo `backend/scripts/validate-api.mjs` (**79 verificações** —
catálogo, auth, pedidos, pagamentos, avaliações, newsletter e endereços) contra
a API a correr em `http://localhost:8081` (ver README do backend).

## Estrutura

```
src/
  app/            # páginas, API routes, metadata, sitemap, robots
  components/
    ui/           # design system
    layout/       # header, footer
    product/      # cards, galeria, buy box, tabs
    home/         # secções da home
    checkout/     # timeline de estado
  context/        # carrinho, favoritos, toasts
  lib/            # tipos, dados, repo (ponto de integração), hooks, format
```
