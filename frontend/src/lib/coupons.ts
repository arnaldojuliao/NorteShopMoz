import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { Coupon } from "@/lib/types";

/** Payload de criação/edição de cupão (espelha o CouponRequest do backend). */
export interface CouponPayload {
  code: string;
  /** PERCENT (discountValue em %) ou FIXED (em MT). */
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  minimumSubtotal?: number;
  /** ISO instant — ausente significa sem validade. */
  expiresAt?: string;
  active?: boolean;
  /** 0 = sem limite de utilizações. */
  usageLimit?: number;
}

/**
 * Lista os cupões (apenas admin). Sem cache — dados de gestão.
 * Lança ApiError (401/403) — o painel decide como reagir.
 */
export async function listCoupons(): Promise<Coupon[]> {
  const { data } = await apiGet<{ data: Coupon[] }>("/api/admin/coupons", 0, true);
  return data;
}

/** Cria um cupão (POST /api/admin/coupons — apenas admin). */
export async function createCoupon(payload: CouponPayload): Promise<Coupon> {
  const { data } = await apiPost<{ data: Coupon }>("/api/admin/coupons", payload);
  return data;
}

/** Atualiza um cupão existente (PUT /api/admin/coupons/{id} — apenas admin). */
export async function updateCoupon(id: number, payload: CouponPayload): Promise<Coupon> {
  const { data } = await apiPut<{ data: Coupon }>(
    `/api/admin/coupons/${encodeURIComponent(id)}`,
    payload,
  );
  return data;
}

/** Remove um cupão (DELETE /api/admin/coupons/{id} — apenas admin). */
export async function deleteCoupon(id: number): Promise<void> {
  await apiDelete<{ data: unknown }>(`/api/admin/coupons/${encodeURIComponent(id)}`);
}
