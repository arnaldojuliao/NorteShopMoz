/**
 * Cliente REST da API NorteShopMoz (backend Spring Boot).
 *
 * Ponto único de acesso HTTP ao backend. Características:
 *  - Base URL configurável via NEXT_PUBLIC_API_BASE_URL (padrão: http://localhost:8081);
 *  - timeout curto (4s) para não travar builds SSG nem o runtime quando a API está em baixo;
 *  - cache em memória com TTL (60s) para evitar chamadas repetidas;
 *  - janela de indisponibilidade (30s) — após uma falha, as chamadas seguintes falham
 *    rápido para o fallback local em vez de acumularem timeouts. Os endpoints de
 *    autenticação ficam de fora: são pedidos explícitos do utilizador e falhar o
 *    login ao instante (sem tentar) é pior do que esperar 4 s;
 *  - falha de rede/timeout é convertida em {@link ApiError}(503) com uma mensagem
 *    honesta, para o UI não a apresentar como erro de credenciais nem inventar
 *    causas que não existem.
 *  - credentials: 'include' para enviar cookies HttpOnly (JWT access/refresh + CSRF).
 */

import { envOr } from "@/lib/env";

// `envOr` (e não `??`) porque um build arg ausente produz string vazia: com
// `API_BASE = ""` o `fetch` do Node rejeita o URL relativo e o SSR/SSG falha.
export const API_BASE = envOr(process.env.NEXT_PUBLIC_API_BASE_URL, "http://localhost:8081").replace(/\/+$/, "");

/**
 * URL da API usada pelas chamadas que correm no SERVIDOR (route handlers do Next,
 * SSR).
 *
 * `NEXT_PUBLIC_API_BASE_URL` é a URL pública, a que o **browser** chama. Usá-la
 * a partir de dentro do contentor do frontend obriga a resolver o domínio
 * público e a sair e voltar pela internet (DNS/hairpin NAT/TLS) — quando isso
 * falha, o catálogo cai em silêncio para os dados locais e a loja mostra preços
 * e stock desatualizados sem nenhum sinal de avaria.
 *
 * Em produção define-se `API_INTERNAL_BASE_URL=http://api:8080` (o nome do
 * serviço na rede do docker-compose). Sem a variável, mantém-se o
 * comportamento anterior (a URL pública).
 */
const SERVER_API_BASE = envOr(process.env.API_INTERNAL_BASE_URL, "").replace(/\/+$/, "");

/** URL base da API para o contexto atual (no servidor usa a interna, se definida). */
export function apiBaseUrl(): string {
  return typeof window === "undefined" && SERVER_API_BASE ? SERVER_API_BASE : API_BASE;
}

const REQUEST_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 60_000;
/** Janela de indisponibilidade após uma falha (evita timeouts em cascata). */
const DOWN_WINDOW_MS = 30_000;

/**
 * Endpoints isentos da janela de indisponibilidade. São pedidos interativos
 * (login, registo, refresh, perfil): o utilizador está à espera de uma resposta,
 * por isso falhar de imediato com "não foi possível ligar" — sem sequer tentar —
 * dava a impressão de rede em baixo quando a API podia estar sã.
 */
function isDownWindowExempt(path: string): boolean {
  return path.startsWith("/api/auth/");
}

/** Mensagem única para falha de rede/timeout (sem resposta HTTP do backend). */
export const API_UNREACHABLE_MESSAGE =
  "O servidor da loja não respondeu. Verifique a sua ligação e tente novamente.";

const CSRF_STORAGE_KEY = "nsm:csrf";

/**
 * Token CSRF — enviado no header `X-CSRF-Token` nos pedidos que alteram estado
 * (padrão double-submit validado pelo backend, que compara header com cookie).
 *
 * O cookie `nsm_csrf` é host-only: só é legível por JavaScript quando o frontend
 * está no mesmo domínio do cookie. Com a API num subdomínio (ex.:
 * `api.loja.mz`) o `document.cookie` **não** o contém e o header seguia vazio —
 * o backend respondia 403 a todos os pedidos autenticados que alteram estado
 * (favoritos, moradas, carrinho com conta, perfil, cancelamento, painel admin).
 *
 * Por isso o token é também devolvido no corpo do login/registo/refresh e em
 * `GET /api/auth/csrf`, e guardado aqui (memória + sessionStorage). A ordem de
 * leitura é: memória → sessionStorage → cookie → endpoint.
 */
let csrfTokenCache: string | null = null;

/** Guarda (ou limpa) o token CSRF — chamado com o valor das respostas de auth. */
export function setCsrfToken(token: string | null | undefined): void {
  const value = typeof token === "string" && token.trim() ? token.trim() : null;
  csrfTokenCache = value;
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      if (value) window.sessionStorage.setItem(CSRF_STORAGE_KEY, value);
      else window.sessionStorage.removeItem(CSRF_STORAGE_KEY);
    }
  } catch {
    /* armazenamento bloqueado (modo privado) — mantém-se em memória */
  }
}

/** Lê o token guardado em memória ou no sessionStorage (sobrevive a F5). */
function readStoredCsrfToken(): string {
  if (csrfTokenCache) return csrfTokenCache;
  try {
    const stored = typeof window !== "undefined" ? window.sessionStorage?.getItem(CSRF_STORAGE_KEY) : null;
    if (stored) {
      csrfTokenCache = stored;
      return stored;
    }
  } catch {
    /* ignora */
  }
  return "";
}

/** Lê o token do cookie (funciona quando a API é servida no mesmo domínio). */
function readCsrfCookie(): string {
  if (typeof document === "undefined") return "";
  try {
    const match = document.cookie.match(/(?:^|;\s*)nsm_csrf=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

/** Token CSRF disponível (memória → sessionStorage → cookie). Vazio se nenhum. */
export function getCsrfToken(): string {
  return readStoredCsrfToken() || readCsrfCookie();
}

/**
 * Endpoints públicos de autenticação: isentos de CSRF no backend, por isso não
 * vale a pena ir buscar (ou esperar por) um token antes de os chamar.
 */
const CSRF_FREE_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/social",
  "/api/auth/logout",
  "/api/auth/refresh",
  "/api/auth/revoke-refresh",
  "/api/auth/csrf",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
]);

let csrfRequest: Promise<string> | null = null;

/**
 * Garante um token CSRF: se não houver nenhum conhecido, pede-o ao backend.
 * Chamadas concorrentes partilham o mesmo pedido.
 */
async function ensureCsrfToken(): Promise<string> {
  const known = getCsrfToken();
  if (known) return known;
  if (!csrfRequest) {
    csrfRequest = (async () => {
      try {
        const res = await fetch(`${apiBaseUrl()}/api/auth/csrf`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return "";
        const json = (await res.json()) as { data?: { csrfToken?: string } };
        const token = json?.data?.csrfToken ?? "";
        if (token) setCsrfToken(token);
        return token;
      } catch {
        return "";
      }
    })().finally(() => {
      csrfRequest = null;
    });
  }
  return csrfRequest;
}

/** Recolhe o token quando o corpo da resposta o traz (login/registo/refresh). */
function captureCsrfToken(body: unknown): void {
  const root = body as { csrfToken?: unknown; data?: { csrfToken?: unknown } } | null;
  const token = root?.data?.csrfToken ?? root?.csrfToken;
  if (typeof token === "string" && token) setCsrfToken(token);
}

interface CacheEntry {
  value: unknown;
  expires: number;
}

const memoryCache = new Map<string, CacheEntry>();
let apiDownUntil = 0;

/**
 * Estado de disponibilidade da API, observável pelo UI.
 *
 * Antes, o fallback para os dados locais (repo.ts) era totalmente silencioso:
 * com a API em baixo ou lenta, a loja renderizava produtos/preços/stock do seed
 * que não correspondiam ao servidor — parecia viva, mas o checkout falhava sem
 * explicação. O banner de modo degradado (ApiDegradedBanner) consome este estado
 * para avisar o cliente (e o operador, via aparência óbvia) sem derrubar a página.
 */
const apiHealthListeners = new Set<(down: boolean) => void>();
let apiDownState = false;

/**
 * Marca a API como indisponível: abre a janela de espera e liga o aviso de modo
 * degradado (o mesmo caminho que faz o catálogo cair nos dados locais).
 *
 * Aplica-se a falhas de rede <em>e</em> a 5xx: nos dois casos o fallback local é
 * acionado a jusante, e sem o aviso a loja mostra produtos/preços do seed como se
 * fossem do servidor.
 */
function markApiDown(): void {
  apiDownUntil = Date.now() + DOWN_WINDOW_MS;
  setApiDown(true);
}

function setApiDown(down: boolean): void {
  if (apiDownState === down) return;
  apiDownState = down;
  for (const listener of apiHealthListeners) {
    try {
      listener(down);
    } catch {
      /* listener com erro nunca derruba a página */
    }
  }
}

/** true se a última falha de rede marcou a API como indisponível (janela ativa). */
export function isApiDown(): boolean {
  return typeof window !== "undefined" && apiDownState;
}

/** Subscreve mudanças de disponibilidade da API (usado pelo banner de degradação). */
export function onApiHealthChange(listener: (down: boolean) => void): () => void {
  apiHealthListeners.add(listener);
  return () => apiHealthListeners.delete(listener);
}

/** Erro com resposta HTTP do backend (ex.: 400 validação) — NÃO é falha de rede. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Limpa a cache em memória (dados temporários) e repõe a janela de indisponibilidade. */
export function clearApiCache(): void {
  memoryCache.clear();
  apiDownUntil = 0;
  setApiDown(false);
}

/**
 * GET JSON com timeout, cache em memória e janela de indisponibilidade.
 * `bypassCache` desativa leitura/escrita na cache — para dados autenticados
 * (ex.: lista admin de pedidos), que nunca devem ser servidos de cache.
 */
export async function apiGet<T>(
  path: string,
  ttlMs = CACHE_TTL_MS,
  bypassCache = false,
  headers?: Record<string, string>,
): Promise<T> {
  if (!bypassCache) {
    const hit = memoryCache.get(path);
    if (hit && hit.expires > Date.now()) return hit.value as T;
  }

  if (Date.now() < apiDownUntil && !isDownWindowExempt(path)) {
    throw new Error("API indisponível (janela de espera)");
  }

  let httpStatus: number | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${apiBaseUrl()}${path}`, {
        headers,
        signal: controller.signal,
        cache: "no-store",
        credentials: "include", // Essencial para cookies HttpOnly
      });
    } finally {
      clearTimeout(timer);
    }
    httpStatus = res.status;
    if (!res.ok) {
      throw new ApiError(res.status, await safeErrorText(res));
    }
    const json = (await res.json()) as T;
    captureCsrfToken(json);
    if (!bypassCache) {
      memoryCache.set(path, { value: json, expires: Date.now() + ttlMs });
    }
    return json;
  } catch (err) {
    // Sem resposta HTTP → rede/timeout: o backend nunca viu o pedido. Um 404
    // legítimo (produto inexistente) NÃO desliga a API; um 5xx desliga, porque
    // também provoca o fallback local silencioso.
    if (httpStatus === null) {
      markApiDown();
      throw new ApiError(503, API_UNREACHABLE_MESSAGE);
    }
    if (httpStatus >= 500) markApiDown();
    throw err;
  }
}

/** POST JSON (sem cache) — mesma política de timeout e janela de indisponibilidade. */
export async function apiPost<T>(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  return apiSend<T>("POST", path, body, headers);
}

/** PUT JSON (sem cache) — ex.: favoritos (substituição completa) e foto de perfil. */
export async function apiPut<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
  return apiSend<T>("PUT", path, body, headers);
}

/** PATCH JSON (sem cache) — ex.: transição de estado do pedido (admin). */
export async function apiPatch<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
  return apiSend<T>("PATCH", path, body, headers);
}

/** DELETE (sem corpo) — ex.: remoção de produto (admin). */
export async function apiDelete<T>(path: string, headers?: Record<string, string>): Promise<T> {
  return apiSend<T>("DELETE", path, undefined, headers);
}

async function apiSend<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  if (Date.now() < apiDownUntil && !isDownWindowExempt(path)) {
    throw new Error("API indisponível (janela de espera)");
  }

  // CSRF (double-submit): o header tem de acompanhar o cookie. O token pode vir
  // do corpo do login/refresh ou do endpoint /api/auth/csrf — nunca depender só
  // de o JS conseguir ler o cookie (com a API num subdomínio não consegue).
  const withDefaults: Record<string, string> = { ...headers };
  if (typeof document !== "undefined" && !CSRF_FREE_PATHS.has(path)) {
    const csrf = await ensureCsrfToken();
    if (csrf) withDefaults["X-CSRF-Token"] = csrf;
  }

  let httpStatus: number | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${apiBaseUrl()}${path}`, {
        method,
        headers: { ...withDefaults, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        credentials: "include", // Essencial para cookies HttpOnly + CSRF
      });
    } finally {
      clearTimeout(timer);
    }
    httpStatus = res.status;
    if (!res.ok) {
      throw new ApiError(res.status, await safeErrorText(res));
    }
    const json = (await res.json()) as T;
    captureCsrfToken(json);
    // Sucesso: limpa a janela e o estado de indisponibilidade (recuperação).
    apiDownUntil = 0;
    setApiDown(false);
    // Logout: o backend limpa o cookie — o token guardado deixaria de bater certo.
    if (path === "/api/auth/logout") setCsrfToken(null);
    return json;
  } catch (err) {
    // Mesma política do GET: sem resposta HTTP o backend não viu o pedido; um 5xx
    // é um servidor avariado (e, no checkout, um pedido que pode não ter entrado).
    if (httpStatus === null) {
      markApiDown();
      throw new ApiError(503, API_UNREACHABLE_MESSAGE);
    }
    if (httpStatus >= 500) markApiDown();
    throw err;
  }
}

/**
 * Cabeçalhos de autenticação a repetir num proxy same-origin (route handler)
 * para o backend.
 *
 * Sem isto um pedido autenticado feito de dentro do Next chegava ao backend sem
 * cookies (sessão HttpOnly), sem token Bearer e sem CSRF — ou seja, era sempre
 * tratado como anónimo. Coexistem as duas formas de autenticação: os cookies
 * (fluxo normal da loja) e o Authorization (clientes antigos/API).
 */
export function forwardedAuthHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const cookie = request.headers.get("cookie");
  if (cookie) headers.cookie = cookie;
  const authorization = request.headers.get("authorization");
  if (authorization) headers.Authorization = authorization;
  const csrf = request.headers.get("x-csrf-token");
  if (csrf) headers["X-CSRF-Token"] = csrf;
  return headers;
}

/** Extrai a mensagem de erro do envelope { error } do backend. */
async function safeErrorText(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body?.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}