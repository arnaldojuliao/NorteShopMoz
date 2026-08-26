import type { Province } from "@/lib/types";
import { provinces as localProvinces } from "@/lib/data/provinces";
import { apiGet } from "@/lib/api";

/**
 * Config de envio — a mesma fonte de verdade do backend (ShippingConfig →
 * GET /api/shipping). O frontend tenta a API primeiro; se indisponível,
 * cai para os dados locais (provinces.ts) com o limite de envio grátis local.
 */

export const LOCAL_FREE_SHIPPING_THRESHOLD = 5000;

export interface ShippingConfig {
  freeShippingThreshold: number;
  provinces: Province[];
}

interface ShippingApiPayload {
  freeShippingThreshold: number;
  provinces: { name: string; fee: number; minDays: number; maxDays: number }[];
}

const LOCAL_SHIPPING: ShippingConfig = {
  freeShippingThreshold: LOCAL_FREE_SHIPPING_THRESHOLD,
  provinces: localProvinces,
};

/** Busca a config do servidor; em falha usa a local (a loja nunca bloqueia). */
export async function getShippingConfig(): Promise<ShippingConfig> {
  try {
    const { data } = await apiGet<{ data: ShippingApiPayload }>("/api/shipping", 5 * 60_000);
    return {
      freeShippingThreshold: data.freeShippingThreshold,
      provinces: data.provinces.map((p) => ({
        name: p.name,
        fee: p.fee,
        days: [p.minDays, p.maxDays],
      })),
    };
  } catch {
    return LOCAL_SHIPPING;
  }
}
