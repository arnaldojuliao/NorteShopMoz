import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import type { Product, ProductVariant } from "@/lib/types";

/** Payload de criação/edição de produto (espelha o ProductRequest do backend). */
export interface CreateProductPayload {
  name: string;
  brand?: string;
  category: string;
  price: number;
  oldPrice?: number;
  stock: number;
  shortDescription: string;
  description?: string[];
  images?: string[];
  tags?: string[];
  badges?: string[];
  specs?: { label: string; value: string }[];
  variants?: ProductVariant[];
  deliveryDays?: [number, number];
  featured?: boolean;
  bestseller?: boolean;
  isNew?: boolean;
  dealOfDay?: boolean;
  freeShipping?: boolean;
}

/**
 * Publica um novo produto (apenas admin). Autenticação via cookies HttpOnly
 * (nsm_at) + header X-CSRF-Token — ambos anexados automaticamente por api.ts.
 * Lança ApiError (401/403/400) — o painel decide como reagir.
 */
export async function createProduct(payload: CreateProductPayload): Promise<Product> {
  const { data } = await apiPost<{ data: Product }>("/api/products", payload);
  return data;
}

/**
 * Atualiza um produto existente (PUT /api/products/{id} — apenas admin).
 * O id é o identificador interno ("p-…"); o slug é regenerado pelo backend
 * se o nome mudar.
 */
export async function updateProduct(id: string, payload: CreateProductPayload): Promise<Product> {
  const { data } = await apiPut<{ data: Product }>(
    `/api/products/${encodeURIComponent(id)}`,
    payload,
  );
  return data;
}

/** Alterações parciais (PATCH /api/products/{id}) — ex.: alternar destaque/stock. */
export async function patchProduct(
  id: string,
  patch: Partial<CreateProductPayload>,
): Promise<Product> {
  const { data } = await apiPatch<{ data: Product }>(
    `/api/products/${encodeURIComponent(id)}`,
    patch,
  );
  return data;
}

/** Remove um produto (DELETE /api/products/{id} — apenas admin). */
export async function deleteProduct(id: string): Promise<void> {
  await apiDelete<{ data: unknown }>(`/api/products/${encodeURIComponent(id)}`);
}

/**
 * Lista produtos para gestão no painel (GET /api/products sem limite).
 * Dados autenticados de administração → nunca servidos da cache.
 */
export async function listAdminProducts(): Promise<Product[]> {
  try {
    const json = await apiGet<{ data: Product[] }>("/api/products", 0, true);
    return json.data ?? [];
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(503, "Catálogo indisponível. Tente novamente em instantes.");
  }
}
