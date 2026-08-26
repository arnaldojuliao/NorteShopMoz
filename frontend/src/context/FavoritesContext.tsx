"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { apiGet, apiPut } from "@/lib/api";
import { useEncryptedStorageState } from "@/lib/encryptedStorage";
import type { Product } from "@/lib/types";

interface FavoritesContextValue {
  ids: string[];
  isFavorite: (productId: string) => boolean;
  toggle: (product: Product) => void;
  /** Remove todos os favoritos (definições — limpar dados locais). */
  clear: () => void;
  count: number;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

const FAV_KEY = "nsm:favorites";

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Usa armazenamento encriptado para favoritos (dados pessoais)
  const [ids, setIds, clearIds, hydrated] = useEncryptedStorageState<string[]>(FAV_KEY, []);

  // Último utilizador já sincronizado — reinicia a merge por utilizador
  // (logout → login de outra conta volta a buscar os favoritos do servidor).
  const syncedForRef = useRef<string | null>(null);

  // No arranque da sessão (ou troca de utilizador): funde os favoritos do
  // servidor com os locais. A persistência da lista fica no effect de `ids`.
  useEffect(() => {
    if (!user || syncedForRef.current === user.id || !hydrated) return;
    syncedForRef.current = user.id;
    let alive = true;
    const boot = async () => {
      try {
        const { data: server } = await apiGet<{ data: string[] }>("/api/favorites", 60_000, true);
        if (!alive) return;
        setIds((prev) => [...new Set([...server, ...prev])]);
      } catch {
        // API indisponível — mantém os favoritos locais.
      }
    };
    void boot();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hydrated]);

  // Persiste a lista no servidor sempre que muda e há sessão (fire-and-forget).
  const lastIdsRef = useRef(ids);
  useEffect(() => {
    if (!user || lastIdsRef.current === ids || !hydrated) return;
    lastIdsRef.current = ids;
    void apiPut("/api/favorites", { productIds: ids }).catch(() => {
      // Falha de rede — o próximo boot/sessão re-sincroniza.
    });
  }, [ids, user, hydrated]);

  const isFavorite = useCallback((productId: string) => ids.includes(productId), [ids]);

  const toggle = useCallback(
    (product: Product) => {
      setIds((prev) =>
        prev.includes(product.id) ? prev.filter((id) => id !== product.id) : [...prev, product.id],
      );
    },
    [setIds],
  );

  const clear = useCallback(() => clearIds(), [clearIds]);

  const value = useMemo(
    () => ({ ids, isFavorite, toggle, clear, count: ids.length }),
    [ids, isFavorite, toggle, clear],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites deve ser usado dentro de <FavoritesProvider>");
  return ctx;
}