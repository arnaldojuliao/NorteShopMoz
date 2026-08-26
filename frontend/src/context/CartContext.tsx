"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CartItem, Product } from "@/lib/types";
import { apiGet, apiPut } from "@/lib/api";
import { getGuestId } from "@/lib/orders";
import { useEncryptedStorageState } from "@/lib/encryptedStorage";
import { useAuth } from "@/context/AuthContext";

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  addItem: (product: Product, qty?: number, variant?: string) => void;
  removeItem: (productId: string, variant?: string) => void;
  updateQty: (productId: string, qty: number, variant?: string) => void;
  clear: () => void;
  bump: number; // dispara a animação do carrinho
}

const CartContext = createContext<CartContextValue | null>(null);

const CART_KEY = "nsm:cart";

/** Espera antes de enviar cada alteração ao servidor (evita spam de PUT). */
const SYNC_DEBOUNCE_MS = 600;

/** Converte os itens locais no payload do PUT /api/cart (o servidor recalcula o resto). */
function toServerPayload(items: CartItem[]) {
  return items.map((i) => ({
    productId: i.productId,
    qty: i.qty,
    variant: i.variant ?? null,
  }));
}

export function CartProvider({ children }: { children: ReactNode }) {
  // `user` identifica a sessão — quando muda (login/logout), os efeitos abaixo
  // re-executam para buscar/sincronizar o carrinho certo (token vs X-Guest-Id).
  const { user } = useAuth();
  const sessionId = user?.id ?? "guest";
  // Identidade de convidado (UUID persistente) — carrinho no servidor sem conta.
  const [guestId] = useState(() => getGuestId());
  // Usa armazenamento encriptado para o carrinho (dados sensíveis: preços, itens)
  const [items, setItems, clearItems, hydrated] = useEncryptedStorageState<CartItem[]>(CART_KEY, []);
  const [bump, setBump] = useState(0);

  // Itens atuais acessíveis fora do render (efeitos de sincronização).
  const itemsRef = useRef<CartItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Evita reenviar ao servidor itens que acabaram de vir dele.
  const skipSync = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bloqueia o sync até o carrinho do servidor ser carregado no arranque (senão
  // um carrinho local vazio sobrescreveria o do servidor antes do GET terminar).
  const booted = useRef(false);

  const addItem = useCallback(
    (product: Product, qty = 1, variant?: string) => {
      setItems((prev) => {
        const existing = prev.find(
          (i) => i.productId === product.id && (i.variant ?? "") === (variant ?? ""),
        );
        if (existing) {
          return prev.map((i) =>
            i === existing ? { ...i, qty: Math.min(i.qty + qty, product.stock) } : i,
          );
        }
        return [
          ...prev,
          {
            productId: product.id,
            slug: product.slug,
            name: product.name,
            image: product.images[0],
            price: product.price,
            oldPrice: product.oldPrice,
            qty,
            variant,
            freeShipping: product.freeShipping,
          },
        ];
      });
      setBump((b) => b + 1);
    },
    [setItems],
  );

  const removeItem = useCallback(
    (productId: string, variant?: string) => {
      setItems((prev) =>
        prev.filter((i) => !(i.productId === productId && (i.variant ?? "") === (variant ?? ""))),
      );
    },
    [setItems],
  );

  const updateQty = useCallback(
    (productId: string, qty: number, variant?: string) => {
      setItems((prev) =>
        prev
          .map((i) =>
            i.productId === productId && (i.variant ?? "") === (variant ?? "")
              ? { ...i, qty: Math.max(1, qty) }
              : i,
          )
          .filter((i) => i.qty > 0),
      );
    },
    [setItems],
  );

  const clear = useCallback(() => {
    clearItems();
    setBump((b) => b + 1);
  }, [clearItems]);

  /**
   * Headers de identidade do carrinho: com sessão ativa o backend identifica o
   * utilizador pelo cookie HttpOnly (prioridade sobre X-Guest-Id); sem sessão,
   * usa o UUID de convidado do dispositivo.
   */
  const cartHeaders = useCallback((): Record<string, string> | null => {
    if (guestId) return { "X-Guest-Id": guestId };
    return {};
  }, [guestId]);

  /**
   * Envia o carrinho atual ao servidor. O servidor recalcula preços do catálogo
   * e devolve os itens — os preços/nomes locais são atualizados com a resposta
   * (merge por produto/variante: a qty local que mudou durante o voo é preservada,
   * itens adicionados entretanto não são sobrescritos).
   */
  const syncToServer = useCallback(() => {
    const headers = cartHeaders();
    if (!headers) return;
    apiPut<{ data: CartItem[] }>("/api/cart", toServerPayload(itemsRef.current), headers)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        // Merge de preços/nomes do catálogo. Se algo mudar, o efeito de sync volta
        // a correr e envia (idempotente — o servidor devolve o mesmo e para aí).
        setItems((prev) => {
          // Só atualiza itens que ainda existem localmente (não reintroduz removidos).
          const serverMap = new Map(data.map((s) => [s.productId + "|" + (s.variant ?? ""), s]));
          let changed = false;
          const next = prev.map((i) => {
            const fresh = serverMap.get(i.productId + "|" + (i.variant ?? ""));
            if (!fresh || (fresh.price === i.price && fresh.name === i.name && fresh.slug === i.slug)) {
              return i;
            }
            changed = true;
            return { ...i, price: fresh.price, oldPrice: fresh.oldPrice, name: fresh.name, slug: fresh.slug, image: fresh.image };
          });
          return changed ? next : prev;
        });
      })
      .catch(() => {
        // Offline/indisponível — o carrinho local continua; será sincronizado depois.
      });
  }, [cartHeaders, setItems]);

  // Envia alterações do carrinho ao servidor (debounced), depois do arranque.
  useEffect(() => {
    if (!cartHeaders() || !booted.current || !hydrated) return;
    if (skipSync.current) {
      skipSync.current = false;
      return;
    }
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(syncToServer, SYNC_DEBOUNCE_MS);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [items, cartHeaders, syncToServer, sessionId, hydrated]);

  // Login/arranque com sessão ou convidado: busca o carrinho do servidor (fonte
  // da verdade com preços atuais do catálogo). Se o servidor estiver vazio mas
  // houver carrinho local, envia-o para lá.
  useEffect(() => {
    const headers = cartHeaders();
    if (!headers) return;
    let alive = true;
    // Nova sessão (login/arranque/convidado): recomeça a fase de boot para o
    // carrinho do servidor ser carregado antes de qualquer sync (não misturar).
    booted.current = false;
    (async () => {
      try {
        const { data } = await apiGet<{ data: CartItem[] }>("/api/cart", 0, true, headers);
        if (!alive) return;
        if (data && data.length > 0) {
          skipSync.current = true;
          setItems(data);
        } else if (itemsRef.current.length > 0) {
          // Servidor vazio mas carrinho local com itens → envia para o servidor.
          syncToServer();
        }
      } catch {
        // Offline — mantém o carrinho local.
      } finally {
        if (alive) booted.current = true;
      }
    })();
    return () => {
      alive = false;
    };
  }, [cartHeaders, setItems, syncToServer, sessionId]);

  const { count, subtotal } = useMemo(() => {
    return {
      count: items.reduce((acc, i) => acc + i.qty, 0),
      subtotal: items.reduce((acc, i) => acc + i.qty * i.price, 0),
    };
  }, [items]);

  const value = useMemo(
    () => ({ items, count, subtotal, addItem, removeItem, updateQty, clear, bump }),
    [items, count, subtotal, addItem, removeItem, updateQty, clear, bump],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart deve ser usado dentro de <CartProvider>");
  return ctx;
}