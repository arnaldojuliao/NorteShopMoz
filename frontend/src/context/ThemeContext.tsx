"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type Theme = "system" | "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Tema efetivamente aplicado ("light" | "dark") — útil para UI que depende do resultado. */
  resolved: "light" | "dark";
}

const THEME_KEY = "nsm:theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Lê o tema guardado (compatível com valores já escritos por useLocalStorageState). */
function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    if (raw != null) {
      try {
        const parsed = JSON.parse(raw) as Theme;
        if (parsed === "light" || parsed === "dark" || parsed === "system") return parsed;
      } catch {
        /* valor guardado sem JSON (ex.: escrita manual) */
      }
      if (raw === "light" || raw === "dark" || raw === "system") return raw;
    }
  } catch {
    /* armazenamento indisponível */
  }
  return "system";
}

/** Aplica (ou remove) a classe `.dark` e o color-scheme no <html>. */
function applyTheme(theme: Theme): "light" | "dark" {
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  return dark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  const readyRef = useRef(false);

  // Arranque: aplica o tema guardado (o script inline no <head> já evitou o flash).
  // O setState é adiado (queueMicrotask) para não disparar atualizações síncronas no efeito.
  useEffect(() => {
    const stored = readStoredTheme();
    queueMicrotask(() => {
      setThemeState(stored);
      setResolved(applyTheme(stored));
      readyRef.current = true;
    });
  }, []);

  // Sempre que o tema muda: persiste, aplica e faz a transição suave.
  useEffect(() => {
    if (!readyRef.current) return;
    try {
      window.localStorage.setItem(THEME_KEY, JSON.stringify(theme));
    } catch {
      /* ignore */
    }
    const root = document.documentElement;
    root.classList.add("theme-switching");
    const t = window.setTimeout(() => root.classList.remove("theme-switching"), 350);
    setResolved(applyTheme(theme));
    return () => window.clearTimeout(t);
  }, [theme]);

  // "Igual ao sistema": reagir a mudanças do SO.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(applyTheme("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  // Sincroniza entre separadores.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_KEY) return;
      setThemeState(readStoredTheme());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme deve ser usado dentro de <ThemeProvider>");
  return ctx;
}
