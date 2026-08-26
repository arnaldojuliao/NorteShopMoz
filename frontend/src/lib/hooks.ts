"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Contagem decrescente (hh:mm:ss) até ao fim do dia local. */
export function useCountdownToMidnight() {
  const [left, setLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    function tick() {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const diff = Math.max(0, end.getTime() - now.getTime());
      const total = Math.floor(diff / 1000);
      setLeft({
        hours: Math.floor(total / 3600),
        minutes: Math.floor((total % 3600) / 60),
        seconds: total % 60,
      });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(left.hours)}:${pad(left.minutes)}:${pad(left.seconds)}`;
}

/**
 * Revela elementos com fade-up quando entram no viewport (callback ref).
 *
 * O threshold é baixo (0.01) para secções muito altas (ex.: grelhas grandes em
 * telemóvel) não ficarem presas invisíveis: 15% de uma secção de 7000px nunca
 * caberia num viewport de 844px. Há ainda um timeout de segurança que força a
 * visibilidade mesmo que o IntersectionObserver nunca dispare.
 */
export function useInView<T extends HTMLElement>(threshold = 0.01) {
  const [visible, setVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = useCallback(
    (node: T | null) => {
      observerRef.current?.disconnect();
      if (!node) return;
      if (typeof IntersectionObserver === "undefined") {
        setVisible(true);
        return;
      }
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        },
        { threshold, rootMargin: "0px 0px -40px 0px" },
      );
      observerRef.current = observer;
      observer.observe(node);
    },
    [threshold],
  );

  // Segurança: nunca deixar conteúdo invisível (fallback ~700ms após montar).
  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 700);
    return () => clearTimeout(id);
  }, []);

  return { ref, visible };
}

/**
 * Carrega dados assíncronos sempre que `deps` muda, com estados de
 * loading/erro e guarda contra atualizações após desmontar.
 * O setState é adiado com queueMicrotask (como o useLocalStorageState)
 * para não disparar atualizações síncronas dentro do efeito.
 */
export function useAsyncData<T>(fetcher: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);

  // Mantém a ref atualizada após cada render (fora da fase de render).
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const result = await fetcherRef.current();
        if (!alive) return;
        queueMicrotask(() => {
          setData(result);
          setError(null);
        });
      } catch (err) {
        if (!alive) return;
        const message = err instanceof Error ? err.message : "Erro ao carregar dados";
        queueMicrotask(() => setError(message));
      } finally {
        if (!alive) return;
        queueMicrotask(() => setLoading(false));
      }
    };
    void run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, setData, setLoading } as const;
}

/**
 * Estado persistente em localStorage, seguro para hidratação:
 * o servidor e o primeiro render do cliente usam `initial`; o valor
 * real é carregado logo após a montagem (sem mismatch SSR ↔ cliente).
 * Sincroniza entre separadores via evento `storage`.
 */
export function useLocalStorageState<T>(key: string, initial: T) {
  const initialRef = useRef(initial);
  const [state, setState] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let value: T = initialRef.current;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) value = JSON.parse(raw) as T;
    } catch {
      /* armazenamento indisponível ou JSON inválido */
    }
    // microtask para não disparar setState síncrono dentro do efeito
    queueMicrotask(() => {
      setState(value);
      setHydrated(true);
    });
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [key, state, hydrated]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      try {
        setState(e.newValue ? (JSON.parse(e.newValue) as T) : initialRef.current);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  return [state, setState] as const;
}
