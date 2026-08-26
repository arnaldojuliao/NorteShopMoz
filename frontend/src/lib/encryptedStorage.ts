"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decryptStorage, encryptStorage, removeEncryptedStorage } from "@/lib/encryption";

/**
 * Estado persistente em localStorage com criptografia AES-GCM.
 * Seguro para hidratação: servidor e primeiro render usam `initial`;
 * valor real carregado após montagem (sem mismatch SSR ↔ cliente).
 * Sincroniza entre separadores via evento `storage`.
 */
export function useEncryptedStorageState<T>(key: string, initial: T) {
  const initialRef = useRef(initial);
  const [state, setState] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  // Carrega valor encriptado na montagem
  useEffect(() => {
    let value: T = initialRef.current;
    const load = async () => {
      try {
        const decrypted = await decryptStorage<T>(key);
        if (decrypted !== null) {
          value = decrypted;
        }
      } catch {
        /* armazenamento indisponível ou falha na descriptografia */
      }
      // microtask para não disparar setState síncrono dentro do efeito
      queueMicrotask(() => {
        setState(value);
        setHydrated(true);
      });
    };
    void load();
  }, [key]);

  // Salva valor encriptado quando muda
  useEffect(() => {
    if (!hydrated) return;
    const save = async () => {
      try {
        await encryptStorage(key, state);
      } catch {
        /* ignore */
      }
    };
    void save();
  }, [key, state, hydrated]);

  // Sincroniza entre separadores
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== `enc:${key}`) return;
      const load = async () => {
        try {
          const decrypted = await decryptStorage<T>(key);
          if (decrypted !== null) {
            queueMicrotask(() => setState(decrypted));
          }
        } catch {
          /* ignore */
        }
      };
      void load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const setEncryptedState = useCallback((newState: T | ((prev: T) => T)) => {
    setState(prev => {
      const next = typeof newState === "function" ? (newState as (prev: T) => T)(prev) : newState;
      // Salva assincronamente
      encryptStorage(key, next).catch(() => {});
      return next;
    });
  }, [key]);

  const clearEncryptedState = useCallback(() => {
    setState(initialRef.current);
    removeEncryptedStorage(key);
  }, [key]);

  return [state, setEncryptedState, clearEncryptedState, hydrated] as const;
}

/** Hook para remover dados encriptados (logout, limpeza). */
export function useClearEncryptedStorage(keys: string[]) {
  return useCallback(() => {
    keys.forEach(key => {
      removeEncryptedStorage(key);
    });
  }, [keys]);
}