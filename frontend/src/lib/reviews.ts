import { apiDelete, apiGet } from "@/lib/api";

/**
 * Moderação de avaliações (painel admin).
 *
 * As avaliações são submetidas pelos clientes em POST /api/products/{slug}/reviews
 * e ficam visíveis na loja de imediato; estes endpoints dão ao admin a lista
 * completa e a remoção. Dados de gestão → nunca servidos de cache.
 */

/** Avaliação como devolvida por GET /api/admin/reviews (com o produto). */
export interface AdminReview {
  id: number;
  productId: string;
  productName: string | null;
  productSlug: string | null;
  author: string;
  rating: number;
  date: string;
  title?: string | null;
  comment: string;
  verified: boolean;
}

/** Página de avaliações do painel admin (contrato de GET /api/admin/reviews). */
export interface AdminReviewsPage {
  items: AdminReview[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

export const ADMIN_REVIEWS_PAGE_SIZE = 20;

/**
 * Página de avaliações (admin) via GET /api/admin/reviews.
 * Lança ApiError (401/403) — a página de admin decide como reagir.
 */
export async function listAdminReviews(page = 0, size = ADMIN_REVIEWS_PAGE_SIZE): Promise<AdminReviewsPage> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  const { data } = await apiGet<{ data: AdminReviewsPage }>(`/api/admin/reviews?${params.toString()}`, 0, true);
  return data;
}

/** Remove uma avaliação (DELETE /api/admin/reviews/{id} — apenas admin). */
export async function deleteReview(id: number): Promise<void> {
  await apiDelete<{ data: unknown }>(`/api/admin/reviews/${encodeURIComponent(String(id))}`);
}
