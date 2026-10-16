import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import type { OrderStatus } from "@/lib/types";

/**
 * Operações de backoffice adicionais do painel admin (e do cliente, nas
 * devoluções). Cada função espelha um endpoint do backend:
 *
 *   Utilizadores        GET/PATCH  /api/admin/users[/{id}/role|ban|unban]
 *   Categorias          GET/POST/PUT/DELETE /api/admin/categories[/{slug}]
 *   Incidências         GET /api/admin/payment-incidents, POST /{id}/resolve
 *   Devoluções          GET/PATCH /api/admin/returns
 *   Devoluções cliente  POST /api/returns/{orderId}, GET /api/returns
 *   Inventário          PATCH/GET /api/admin/stock/{products/{id}|low|movements}
 *   Relatórios          GET /api/orders/admin/stats?from&to, GET /api/orders/admin/export
 *
 * Todas re-lançam ApiError — as páginas decidem como reagir (401 → terminar
 * sessão, 403 → sem permissões, 409 → conflito de estado).
 */

/* ── Utilizadores ─────────────────────────────────────────────────────────── */

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: string;
  emailVerified: boolean;
  authProvider: string;
  banned: boolean;
  bannedReason?: string | null;
  createdAt?: string;
}

export interface AdminUsersPage {
  users: AdminUser[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

export async function listAdminUsers(
  q?: string,
  page = 0,
  size = 20,
): Promise<AdminUsersPage> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("page", String(page));
  params.set("size", String(size));
  const { data } = await apiGet<{ data: AdminUsersPage }>(
    `/api/admin/users?${params.toString()}`,
    0,
    true,
  );
  return data;
}

export async function setUserRole(id: string, role: "ADMIN" | "CUSTOMER"): Promise<AdminUser> {
  const { data } = await apiPatch<{ data: AdminUser }>(
    `/api/admin/users/${encodeURIComponent(id)}/role`,
    { role },
  );
  return data;
}

export async function banUser(id: string, reason?: string): Promise<AdminUser> {
  const { data } = await apiPatch<{ data: AdminUser }>(
    `/api/admin/users/${encodeURIComponent(id)}/ban`,
    { reason },
  );
  return data;
}

export async function unbanUser(id: string): Promise<AdminUser> {
  const { data } = await apiPatch<{ data: AdminUser }>(
    `/api/admin/users/${encodeURIComponent(id)}/unban`,
    {},
  );
  return data;
}

/* ── Categorias ───────────────────────────────────────────────────────────── */

export interface AdminCategory {
  slug: string;
  name: string;
  emoji?: string | null;
  image?: string | null;
  description?: string | null;
}

export async function listAdminCategories(): Promise<AdminCategory[]> {
  const { data } = await apiGet<{ data: AdminCategory[] }>("/api/admin/categories", 0, true);
  return data;
}

export async function createCategory(payload: Omit<AdminCategory, "slug"> & { slug?: string }) {
  const { data } = await apiPost<{ data: AdminCategory }>("/api/admin/categories", payload);
  return data;
}

export async function updateCategory(slug: string, payload: Omit<AdminCategory, "slug">) {
  const { data } = await apiPut<{ data: AdminCategory }>(
    `/api/admin/categories/${encodeURIComponent(slug)}`,
    payload,
  );
  return data;
}

export async function deleteCategory(slug: string) {
  const { data } = await apiDelete<{ data: { deleted: boolean } }>(
    `/api/admin/categories/${encodeURIComponent(slug)}`,
  );
  return data;
}

/* ── Incidências de pagamento ─────────────────────────────────────────────── */

export interface PaymentIncident {
  id: number;
  orderId: string;
  paymentReference?: string | null;
  incidentType: string;
  detail?: string | null;
  status: string;
  createdAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

export async function listPaymentIncidents(status?: string): Promise<PaymentIncident[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  const { data } = await apiGet<{ data: { incidents: PaymentIncident[] } }>(
    `/api/admin/payment-incidents${qs ? `?${qs}` : ""}`,
    0,
    true,
  );
  return data.incidents;
}

export async function resolvePaymentIncident(id: number, note?: string) {
  const { data } = await apiPost<{ data: { incident: PaymentIncident } }>(
    `/api/admin/payment-incidents/${id}/resolve`,
    { note },
  );
  return data.incident;
}

/* ── Devoluções ───────────────────────────────────────────────────────────── */

export type ReturnStatus = "PEDIDO" | "APROVADA" | "REJEITADA" | "REEMBOLSADA";

export interface ReturnRequestItem {
  id: number;
  orderId: string;
  reason: string;
  status: ReturnStatus;
  adminNote?: string | null;
  refundAmount?: number | null;
  createdAt: string;
  updatedAt: string;
  order?: {
    id: string;
    date?: string;
    status?: OrderStatus | string;
    total?: number;
    paymentMethod?: string;
  };
}

export async function listAdminReturns(status?: string): Promise<ReturnRequestItem[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  const { data } = await apiGet<{ data: { returns: ReturnRequestItem[] } }>(
    `/api/admin/returns${qs ? `?${qs}` : ""}`,
    0,
    true,
  );
  return data.returns;
}

export async function decideReturn(id: number, decision: "APROVADA" | "REJEITADA", adminNote?: string) {
  const { data } = await apiPatch<{ data: ReturnRequestItem }>(`/api/admin/returns/${id}`, {
    decision,
    adminNote,
  });
  return data;
}

/** Cliente: pede a devolução de um pedido entregue. */
export async function requestReturn(orderId: string, reason: string): Promise<ReturnRequestItem> {
  const { data } = await apiPost<{ data: ReturnRequestItem }>(
    `/api/returns/${encodeURIComponent(orderId)}`,
    { reason },
  );
  return data;
}

/** Cliente: as minhas devoluções. */
export async function listMyReturns(): Promise<ReturnRequestItem[]> {
  const { data } = await apiGet<{ data: ReturnRequestItem[] }>("/api/returns", 0, true);
  return data;
}

/* ── Inventário ───────────────────────────────────────────────────────────── */

export async function adjustStock(productId: string, stock: number, detail?: string) {
  const { data } = await apiPatch<{ data: { productId: string; previousStock: number; stock: number; delta: number } }>(
    `/api/admin/stock/products/${encodeURIComponent(productId)}`,
    { stock, detail },
  );
  return data;
}

export interface StockMovement {
  id: number;
  productId: string;
  delta: number;
  stockAfter?: number | null;
  reason: string;
  detail?: string | null;
  createdAt: string;
}

export async function listStockMovements(productId?: string, limit = 50): Promise<StockMovement[]> {
  const params = new URLSearchParams();
  if (productId) params.set("productId", productId);
  params.set("limit", String(limit));
  const { data } = await apiGet<{ data: { movements: StockMovement[] } }>(
    `/api/admin/stock/movements?${params.toString()}`,
    0,
    true,
  );
  return data.movements;
}

/* ── Relatórios ───────────────────────────────────────────────────────────── */

/** Recorta as estatísticas por período — janela [from, to), ISO YYYY-MM-DD. */
export async function fetchSalesStatsPeriod(from: string, to: string) {
  const { data } = await apiGet<{ data: ReturnType<typeof Object> }>(
    `/api/orders/admin/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    0,
    true,
  );
  return data;
}

/** URL do export CSV (mesmos filtros do painel) — usado num link de download. */
export function adminOrdersExportUrl(from: string, to: string, status?: OrderStatus | ""): string {
  const params = new URLSearchParams();
  params.set("from", from);
  params.set("to", to);
  if (status) params.set("status", status);
  return `/api/orders/admin/export?${params.toString()}`;
}
