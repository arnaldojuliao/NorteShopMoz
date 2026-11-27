import type { AddressBookEntry } from "@/lib/types";
import { apiGet, apiPut } from "@/lib/api";

/**
 * Camada de endereços de entrega — sincroniza o livro de endereços (nsm:addresses)
 * com o backend (GET/PUT /api/addresses). Sem sessão (ou API indisponível) os
 * endereços continuam apenas em localStorage.
 *
 * Autenticação via cookies HttpOnly + CSRF (anexados automaticamente por api.ts).
 */

/**
 * Chave local do livro de endereços, isolada por utilizador. A chave global
 * antiga (`nsm:addresses`) fazia com que, numa conta sem endereços no servidor,
 * o checkout usasse os endereços guardados pela conta anterior no mesmo
 * dispositivo — e os enviasse para a conta errada.
 */
export function addressStorageKey(userId?: string | null): string {
  return userId ? `nsm:addresses:${userId}` : "nsm:addresses:guest";
}

/** Lê os endereços locais do utilizador (ou do convidado). */
export function readLocalAddresses(userId?: string | null): AddressBookEntry[] {
  try {
    const key = addressStorageKey(userId);
    let raw = window.localStorage.getItem(key);
    // Migração única dos endereços de convidado da chave antiga.
    if (raw == null && !userId) {
      raw = window.localStorage.getItem("nsm:addresses");
      if (raw != null) window.localStorage.setItem(key, raw);
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AddressBookEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Grava os endereços locais do utilizador (ou do convidado). */
export function writeLocalAddresses(
  userId: string | null | undefined,
  addresses: AddressBookEntry[],
): void {
  try {
    window.localStorage.setItem(addressStorageKey(userId), JSON.stringify(addresses));
  } catch {
    /* armazenamento indisponível */
  }
}

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
      neighborhood: a.neighborhood,
      reference: a.reference,
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
