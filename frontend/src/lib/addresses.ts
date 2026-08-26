import type { AddressBookEntry } from "@/lib/types";
import { apiGet, apiPut } from "@/lib/api";

/**
 * Camada de endereços de entrega — sincroniza o livro de endereços (nsm:addresses)
 * com o backend (GET/PUT /api/addresses). Sem sessão (ou API indisponível) os
 * endereços continuam apenas em localStorage.
 *
 * Autenticação via cookies HttpOnly + CSRF (anexados automaticamente por api.ts).
 */

/** Forma devolvida pelo servidor (id numérico + coordenadas planas). */
interface ServerAddress extends Omit<AddressBookEntry, "id" | "coords"> {
  id: number;
  lat?: number | null;
  lng?: number | null;
}

/** Normaliza a resposta do servidor para o tipo do frontend (id → string, coords). */
function normalize(data: ServerAddress[]): AddressBookEntry[] {
  return data.map((e) => ({
    ...e,
    id: String(e.id),
    coords: e.lat != null && e.lng != null ? { lat: e.lat, lng: e.lng } : undefined,
  }));
}

/** Endereços do utilizador autenticado. null sem sessão ou em falha de rede. */
export async function fetchMyAddresses(): Promise<AddressBookEntry[] | null> {
  try {
    // Sem cache (dados pessoais); cookies HttpOnly enviados automaticamente.
    const { data } = await apiGet<{ data: ServerAddress[] }>("/api/addresses", 0, true);
    return normalize(data ?? []);
  } catch {
    return null;
  }
}

/**
 * Substitui a lista completa de endereços no servidor (mesmo padrão do carrinho).
 * Devolve a lista normalizada do servidor; null em falha de rede/sessão.
 */
export async function saveMyAddresses(
  addresses: AddressBookEntry[],
): Promise<AddressBookEntry[] | null> {
  try {
    const payload = addresses.map((a) => ({
      label: a.label,
      fullName: a.fullName,
      phone: a.phone,
      address: a.address,
      city: a.city,
      province: a.province,
      isDefault: a.isDefault,
      lat: a.coords?.lat,
      lng: a.coords?.lng,
    }));
    const { data } = await apiPut<{ data: ServerAddress[] }>("/api/addresses", payload);
    return normalize(data ?? []);
  } catch {
    return null;
  }
}
