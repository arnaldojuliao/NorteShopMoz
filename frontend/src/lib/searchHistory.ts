"use client";

/**
 * Histórico de buscas do utilizador — a secção "Buscas recentes" do combobox.
 *
 * Guardado em localStorage (chave `nsm:search-history`): é por dispositivo
 * (nada de histórico a viajar para o servidor), sobrevive a recarregamentos e
 * a escrita tolera armazenamento bloqueado (janela privada). Máximo de 8
 * entradas, deduplicação case-insensitive com a mais recente em cima — é um
 * atalho, não um arquivo.
 */

const KEY = "nsm:search-history";
const MAX = 8;

export function getSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cleaned = parsed
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
    // Guard de deduplicação para valores já persistidos em versões antigas.
    const seen = new Set<string>();
    return cleaned.filter((entry) => {
      const normalized = entry.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
    } catch {
    return [];
  }
}

export function addSearchTerm(term: string): void {
  const trimmed = term.trim();
  if (!trimmed) return;
  const current = getSearchHistory();
  const normalized = trimmed.toLowerCase();
  const next = [
    trimmed,
    ...current.filter((entry) => entry.toLowerCase() !== normalized),
  ].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage indisponível (modo privado/quota): o histórico é dispensável.
  }
}

export function removeSearchTerm(term: string): void {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return;
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify(
        getSearchHistory().filter(
          (entry) => entry.toLowerCase() !== normalized,
        ),
      ),
    );
  } catch {
    // Idem: sem armazenamento, a remoção é inócua.
  }
}

export function clearSearchHistory(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Ignorado.
  }
}
