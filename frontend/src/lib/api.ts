/**
 * Cliente REST da API NorteShop (backend Spring Boot).
 *
 * Ponto único de acesso HTTP ao backend. Características:
 *  - Base URL configurável via NEXT_PUBLIC_API_BASE_URL (padrão: http://localhost:8081);
 *  - timeout curto (4s) para não travar builds SSG nem o runtime quando a API está em baixo;
 *  - cache em memória com TTL (60s) para evitar chamadas repetidas;
 *  - janela de indisponibilidade (30s) — após uma falha, as chamadas seguintes falham
 *    rápido para o fallback local em vez de acumularem timeouts.
 *  - credentials: 'include' para enviar cookies HttpOnly (JWT access/refresh + CSRF).
 */

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8081").replace(/\/+$/, "");

const REQUEST_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 60_000;
/** Janela de indisponibilidade após uma falha (evita timeouts em cascata). */
const DOWN_WINDOW_MS = 30_000;

/**
 * Lê o token CSRF do cookie `nsm_csrf` (definido no login/refresh, acessível
 * por JS de propósito). Enviado no header X-CSRF-Token em pedidos que alteram
 * estado — padrão Double-Submit Cookie validado pelo backend.
 */
export function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  try {
    const match = document.cookie.match(/(?:^|;\s*)nsm_csrf=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

interface CacheEntry {
  value: unknown;
  expires: number;
}

const memoryCache = new Map<string, CacheEntry>();
let apiDownUntil = 0;

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

  if (Date.now() < apiDownUntil) {
    throw new Error("API indisponível (janela de espera)");
  }

  let httpStatus: number | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
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
    if (!bypassCache) {
      memoryCache.set(path, { value: json, expires: Date.now() + ttlMs });
    }
    return json;
  } catch (err) {
    // Só falhas de rede/timeout (sem resposta HTTP) marcam a API como indisponível.
    // Um 404 legítimo (ex.: produto inexistente) NÃO deve desligar a API.
    if (httpStatus === null) {
      apiDownUntil = Date.now() + DOWN_WINDOW_MS;
    }
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
  if (Date.now() < apiDownUntil) {
    throw new Error("API indisponível (janela de espera)");
  }

  // CSRF (double-submit cookie): header com o valor do cookie nsm_csrf em
  // todos os métodos que alteram estado — o backend valida e rejeita sem ele.
  const withDefaults: Record<string, string> = { ...headers };
  if (typeof document !== "undefined") {
    const csrf = getCsrfToken();
    if (csrf) withDefaults["X-CSRF-Token"] = csrf;
  }

  let httpStatus: number | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
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
    return (await res.json()) as T;
  } catch (err) {
    if (httpStatus === null) {
      apiDownUntil = Date.now() + DOWN_WINDOW_MS;
    }
    throw err;
  }
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