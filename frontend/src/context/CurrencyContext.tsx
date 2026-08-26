"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatFromMZN, isCurrencyCode, type CurrencyCode } from "@/lib/currency";

/**
 * Moeda de apresentação — escolhida em Configurações → Preferências → Moeda
 * e partilhada por toda a app via este contexto. O valor é persistido na
 * chave `nsm:prefs` do localStorage (a mesma usada pela página de definições).
 *
 * Os preços continuam armazenados em MZN; a conversão é apenas visual.
 */

interface CurrencyContextValue {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  /** Formata um valor em MZN (base do catálogo) para a moeda ativa. */
  format: (valueMzn: number) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function readStoredCurrency(): CurrencyCode {
  if (typeof window === "undefined") return "MZN";
  try {
    const raw = window.localStorage.getItem("nsm:prefs");
    if (!raw) return "MZN";
    const prefs = JSON.parse(raw) as { currency?: string };
    return prefs.currency && isCurrencyCode(prefs.currency) ? prefs.currency : "MZN";
  } catch {
    return "MZN";
  }
}

/** Escreve a moeda na chave nsm:prefs sem tocar nas restantes preferências. */
function writePrefsCurrency(currency: CurrencyCode): void {
  try {
    const raw = window.localStorage.getItem("nsm:prefs");
    const prefs = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    prefs.currency = currency;
    window.localStorage.setItem("nsm:prefs", JSON.stringify(prefs));
  } catch {
    /* armazenamento indisponível — mantém só em memória */
  }
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>("MZN");

  // Hidrata após o mount (SSR-safe): o valor inicial no servidor é sempre MZN;
  // aqui lemos a preferência do dispositivo uma única vez.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratação única de localStorage
    setCurrencyState(readStoredCurrency());
  }, []);

  const setCurrency = useCallback((c: CurrencyCode) => {
    setCurrencyState(c);
    writePrefsCurrency(c);
  }, []);

  const value = useMemo<CurrencyContextValue>(
    () => ({ currency, setCurrency, format: (v: number) => formatFromMZN(v, currency) }),
    [currency, setCurrency],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency deve ser usado dentro de <CurrencyProvider>");
  return ctx;
}
