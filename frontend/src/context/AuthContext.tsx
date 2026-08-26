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
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { useLocalStorageState } from "@/lib/hooks";
import { setStoredUser, clearUserOrders } from "@/lib/orders";
import type { UserProfile } from "@/lib/types";

export interface NotificationPrefs {
  emailOffers: boolean;
  emailNews: boolean;
  emailOrder: boolean;
  whatsappOffers: boolean;
  whatsappOrder: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role?: string;
  avatar?: string;
  emailVerified?: boolean;
  authProvider?: string;
  notificationPrefs?: NotificationPrefs;
}

interface AuthResponse {
  token: string;
  refreshToken: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  initializing: boolean;
  sessionExpired: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<AuthUser>;
  register: (data: { fullName: string; email: string; password: string; phone?: string }) => Promise<AuthUser>;
  socialLogin: (provider: "google" | "facebook", token: string) => Promise<AuthUser>;
  logout: () => void;
  refresh: () => Promise<void>;
  updateAvatar: (avatar: string | null) => Promise<AuthUser>;
  resendVerification: () => Promise<AuthUser>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Tempo de inatividade após o qual a sessão expira completamente (requer login).
 * Configurável via NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES (padrão: 30 minutos).
 */
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min
const LAST_ACTIVE_KEY = "nsm:last-active";

function readLastActive(): number {
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : Date.now();
  } catch {
    return Date.now();
  }
}

function writeLastActive() {
  try {
    window.localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  } catch {
    /* armazenamento indisponível */
  }
}

function getSessionTimeout(): number {
  try {
    const minutes = Number(process.env.NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES ?? "30");
    return minutes * 60 * 1000;
  } catch {
    return DEFAULT_SESSION_TIMEOUT_MS;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [, setProfile] = useLocalStorageState<UserProfile | null>("nsm:profile", null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const expireSession = useCallback(() => {
    clearRefreshTimer();
    setUser(null);
    setStoredUser({ email: "", name: "" });
    setProfile(null); // Limpa avatar e dados do perfil do localStorage
    setSessionExpired(true);
  }, [clearRefreshTimer, setProfile]);

  const refreshTokensRef = useRef<() => Promise<void>>(async () => {});

  const scheduleTokenRefresh = useCallback((token: string) => {
    clearRefreshTimer();
    const expiry = getTokenExpiry(token);
    if (!expiry) return;
    const now = Date.now();
    const delay = expiry - now - 5 * 60 * 1000; // 5 min buffer
    if (delay <= 0) {
      void refreshTokensRef.current();
      return;
    }
    refreshTimerRef.current = setTimeout(() => {
      void refreshTokensRef.current();
    }, delay);
  }, [clearRefreshTimer]);

  const refreshTokens = useCallback(async () => {
    try {
      const { data } = await apiPost<{ data: AuthResponse }>("/api/auth/refresh", {});
      setUser(data.user);
      setStoredUser({ email: data.user.email, name: data.user.fullName });
      setProfile((prev: UserProfile | null) => ({
        fullName: data.user.fullName,
        email: data.user.email,
        phone: prev?.phone ?? "",
        avatar: data.user.avatar ?? prev?.avatar,
      }));
      scheduleTokenRefresh(data.token);
    } catch {
      expireSession();
    }
  }, [setProfile, scheduleTokenRefresh, expireSession]);

  // Atualiza a ref após criar refreshTokens
  useEffect(() => {
    refreshTokensRef.current = refreshTokens;
  }, [refreshTokens]);

  const applyAuth = useCallback(
    (auth: AuthResponse) => {
      setUser(auth.user);
      setStoredUser({ email: auth.user.email, name: auth.user.fullName });
      setProfile((prev: UserProfile | null) => ({
        fullName: auth.user.fullName,
        email: auth.user.email,
        phone: prev?.phone ?? "",
        avatar: auth.user.avatar ?? prev?.avatar,
      }));
      scheduleTokenRefresh(auth.token);
    },
    [setProfile, scheduleTokenRefresh],
  );

  const logout = useCallback(async () => {
    try {
      await apiPost("/api/auth/logout", {});
    } catch {
      // Ignora erros — backend limpa cookies de qualquer forma
    }
    if (user?.id) clearUserOrders(user.id);
    expireSession();
  }, [expireSession, user]);

  useEffect(() => {
    if (!sessionExpired) return;
    router.replace("/");
    queueMicrotask(() => setSessionExpired(false));
  }, [router, sessionExpired]);

  useEffect(() => {
    const touch = () => writeLastActive();
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      // Verifica expiração por inatividade (apenas se houver sessão ativa via cookie)
      if (Date.now() - readLastActive() > getSessionTimeout()) {
        expireSession();
      } else {
        writeLastActive();
      }
    };
    window.addEventListener("click", touch);
    window.addEventListener("keydown", touch);
    window.addEventListener("touchstart", touch, { passive: true });
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("pageshow", onReturn);
    return () => {
      window.removeEventListener("click", touch);
      window.removeEventListener("keydown", touch);
      window.removeEventListener("touchstart", touch);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("pageshow", onReturn);
    };
  }, [expireSession]);

  useEffect(() => {
    let alive = true;
    const boot = async () => {
      if (Date.now() - readLastActive() > getSessionTimeout()) {
        expireSession();
        queueMicrotask(() => {
          if (alive) setInitializing(false);
        });
        return;
      }
      writeLastActive();
      try {
        // /api/auth/me lê o access token do cookie HttpOnly automaticamente
        const { data } = await apiGet<{ data: AuthUser }>("/api/auth/me");
        if (!alive) return;
        setUser(data);
        setStoredUser({ email: data.email, name: data.fullName });
        setProfile((prev) => {
          const base = prev ?? { fullName: data.fullName, email: data.email, phone: "" };
          return { ...base, avatar: data.avatar ?? base.avatar };
        });
        scheduleTokenRefresh(""); // Access token não disponível no frontend (HttpOnly)
        // Agendamento baseado no tempo de vida conhecido (7 dias)
        setTimeout(() => void refreshTokens(), 6 * 24 * 60 * 60 * 1000); // 6 dias
      } catch {
        if (!alive) return;
        // Token inválido/expirado → tenta refresh automático via cookie
        try {
          const { data } = await apiPost<{ data: AuthResponse }>("/api/auth/refresh", {});
          setUser(data.user);
          setStoredUser({ email: data.user.email, name: data.user.fullName });
          setProfile((prev) => {
            const base = prev ?? { fullName: data.user.fullName, email: data.user.email, phone: "" };
            return { ...base, avatar: data.user.avatar ?? base.avatar };
          });
          scheduleTokenRefresh(data.token);
        } catch {
          expireSession();
        }
      } finally {
        if (alive) setInitializing(false);
      }
    };
    void boot();
    return () => {
      alive = false;
      clearRefreshTimer();
    };
  }, [expireSession, setProfile, scheduleTokenRefresh, clearRefreshTimer, refreshTokens]);

  const login = useCallback(
    async (email: string, password: string, rememberMe = false) => {
      const { data } = await apiPost<{ data: AuthResponse }>("/api/auth/login", { email, password, rememberMe });
      applyAuth(data);
      return data.user;
    },
    [applyAuth],
  );

  const socialLogin = useCallback(
    async (provider: "google" | "facebook", token: string) => {
      const { data } = await apiPost<{ data: AuthResponse }>("/api/auth/social", { provider, token });
      applyAuth(data);
      return data.user;
    },
    [applyAuth],
  );

  const register = useCallback(
    async (data: { fullName: string; email: string; password: string; phone?: string }) => {
      const { data: auth } = await apiPost<{ data: AuthResponse }>("/api/auth/register", data);
      applyAuth(auth);
      return auth.user;
    },
    [applyAuth],
  );

  const refresh = useCallback(async () => {
    try {
      const { data } = await apiGet<{ data: AuthUser }>("/api/auth/me");
      setUser(data);
      setStoredUser({ email: data.email, name: data.fullName });
      setProfile((prev) => {
        const base = prev ?? { fullName: data.fullName, email: data.email, phone: "" };
        return { ...base, avatar: data.avatar ?? base.avatar };
      });
    } catch {
      // Perfil inacessível — mantém o estado atual.
    }
  }, [setProfile]);

  const updateAvatar = useCallback(
    async (avatar: string | null) => {
      const { data } = await apiPut<{ data: AuthUser }>(
        "/api/auth/me/avatar",
        { avatar: avatar ?? "" },
      );
      setUser(data);
      setProfile((prev) => {
        const base = prev ?? { fullName: data.fullName, email: data.email, phone: "" };
        return { ...base, avatar: data.avatar ?? undefined };
      });
      return data;
    },
    [setProfile],
  );

  const resendVerification = useCallback(async () => {
    const { data } = await apiPost<{ data: AuthUser }>(
      "/api/auth/resend-verification",
      {},
    );
    setUser(data);
    return data;
  }, []);

  const value = useMemo(
    () => ({
      user,
      initializing,
      sessionExpired,
      login,
      register,
      socialLogin,
      logout,
      refresh,
      updateAvatar,
      resendVerification,
    }),
    [user, initializing, sessionExpired, login, register, socialLogin, logout, refresh, updateAvatar, resendVerification],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}

function getTokenExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded.exp * 1000;
  } catch {
    return null;
  }
}