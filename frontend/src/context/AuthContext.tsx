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
import { hasStoredUser, setStoredUser, clearUserOrders } from "@/lib/orders";
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

/**
 * Resposta de autenticação do backend. NÃO contém os tokens JWT: o access e o
 * refresh token vivem em cookies HttpOnly (invisíveis ao JavaScript). O backend
 * devolve apenas a validade do access token, para agendar a renovação.
 */
interface AuthResponse {
  user: AuthUser;
  csrfToken?: string;
  expiresInSeconds?: number;
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
/** Validade padrão do access token (1 hora) — usada quando o backend não a indica. */
const DEFAULT_ACCESS_TOKEN_SECONDS = 60 * 60;
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

/**
 * Existia sessão neste navegador? Um visitante anónimo também termina o arranque
 * com 401 (`/me` e `/refresh`), e tratá-lo como "sessão expirada" expulsava-o da
 * página onde estava (o efeito de `sessionExpired` faz `router.replace("/")`) a
 * poucos segundos de a abrir, além de apagar o perfil local que preenche o
 * checkout de convidado.
 *
 * Sinais de sessão: a marca `nsm:user` (escrita no login/refresh, removida no
 * logout) ou o cookie `nsm_csrf` (não-HttpOnly de propósito, para o double
 * submit).
 */
function hadSession(): boolean {
  if (typeof window === "undefined") return false;
  if (hasStoredUser()) return true;
  return /(?:^|;\s*)nsm_csrf=/.test(document.cookie);
}

function getSessionTimeout(): number {
  // A variável pode chegar vazia (build arg/env não definidos): `Number("")` é 0,
  // o que expiraria a sessão de imediato; um valor não numérico dá NaN e a sessão
  // nunca expirava. Em qualquer dos casos usa-se o default (30 min).
  const minutes = Number(process.env.NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES);
  return Number.isFinite(minutes) && minutes > 0
    ? minutes * 60 * 1000
    : DEFAULT_SESSION_TIMEOUT_MS;
}

/**
 * Perfil local correspondente a um utilizador autenticado.
 *
 * Os campos que não vêm do servidor (telefone, usado para pré-preencher o
 * checkout) só são herdados quando o perfil guardado é do MESMO email. Antes
 * eram herdados sempre, pelo que entrar noutra conta mostrava o telefone e a
 * foto de perfil da conta anterior — cada conta passa a ter apenas os seus
 * dados. A foto vem do servidor (`user.avatar`), que é a única fonte por conta.
 */
function profileForUser(prev: UserProfile | null, user: AuthUser): UserProfile {
  const sameAccount = Boolean(prev?.email) && prev!.email.toLowerCase() === user.email.toLowerCase();
  return {
    fullName: user.fullName,
    email: user.email,
    phone: sameAccount ? prev!.phone ?? "" : "",
    avatar: user.avatar ?? undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  // Estado atual do user acessível fora do render (efeitos em voo — o boot pode
  // terminar depois de um login ter já estabelecido a sessão).
  const userRef = useRef<AuthUser | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
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
    setStoredUser(null); // Remove a chave nsm:user (não gravar um utilizador vazio)
    setProfile(null); // Limpa avatar e dados do perfil do localStorage
    setSessionExpired(true);
  }, [clearRefreshTimer, setProfile]);

  const refreshTokensRef = useRef<() => Promise<void>>(async () => {});

  /**
   * Agenda a renovação do access token. Recebe a validade em segundos que o
   * backend devolve no login/refresh; sem valor (arranque a partir de /me, onde
   * os cookies são HttpOnly e o frontend não vê o token) usa o padrão.
   */
  const scheduleTokenRefresh = useCallback((expiresInSeconds?: number) => {
    clearRefreshTimer();
    const seconds = expiresInSeconds && expiresInSeconds > 0
      ? expiresInSeconds
      : DEFAULT_ACCESS_TOKEN_SECONDS;
    // Renova 5 minutos antes de expirar, com um mínimo de 30s (evita um ciclo
    // apertado se a validade configurada for muito curta).
    const delay = Math.max(30_000, seconds * 1000 - 5 * 60 * 1000);
    refreshTimerRef.current = setTimeout(() => {
      void refreshTokensRef.current();
    }, delay);
  }, [clearRefreshTimer]);

  const refreshTokens = useCallback(async () => {
    try {
      const { data } = await apiPost<{ data: AuthResponse }>("/api/auth/refresh", {});
      setUser(data.user);
      setStoredUser({ email: data.user.email, name: data.user.fullName });
      setProfile((prev: UserProfile | null) => profileForUser(prev, data.user));
      scheduleTokenRefresh(data.expiresInSeconds);
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
      setProfile((prev: UserProfile | null) => profileForUser(prev, auth.user));
      scheduleTokenRefresh(auth.expiresInSeconds);
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
      // Verifica expiração por inatividade — só com sessão para expirar
      // (visitante anónimo não é expulso da página ao voltar ao separador).
      if (Date.now() - readLastActive() > getSessionTimeout() && hadSession()) {
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
        if (hadSession()) expireSession();
        queueMicrotask(() => {
          if (alive) setInitializing(false);
        });
        return;
      }
      writeLastActive();
      // Sem qualquer sinal de sessão (marca `nsm:user` ou cookie `nsm_csrf`) não
      // há nada para validar: sem isto, cada visitante anónimo fazia dois pedidos
      // (me + refresh) que acabavam em 401 em todas as páginas.
      if (!hadSession()) {
        queueMicrotask(() => {
          if (alive) setInitializing(false);
        });
        return;
      }
      try {
        // /api/auth/me lê o access token do cookie HttpOnly automaticamente.
        // Sem cache (ttl 0 + bypass): o perfil é sensível ao utilizador e um
        // cache de 60 s podia devolver o perfil de quem estava ligado antes
        // (ex.: após troca rápida de conta no mesmo browser).
        const { data } = await apiGet<{ data: AuthUser }>("/api/auth/me", 0, true);
        if (!alive) return;
        setUser(data);
        setStoredUser({ email: data.email, name: data.fullName });
        setProfile((prev) => profileForUser(prev, data));
        // Tokens em cookies HttpOnly — não há token para inspecionar. Usa a
        // validade padrão do access token para agendar a renovação.
        scheduleTokenRefresh();
      } catch {
        if (!alive) return;
        // Uma sessão pode ter sido estabelecida enquanto este boot estava em
        // voo (ex.: login submetido no arranque) — não a destruir.
        if (userRef.current) {
          setInitializing(false);
          return;
        }
        // Token inválido/expirado → tenta refresh automático via cookie
        try {
          const { data } = await apiPost<{ data: AuthResponse }>("/api/auth/refresh", {});
          if (!alive) return;
          if (userRef.current) {
            // Sessão entretanto estabelecida — não sobrescrever com tokens velhos.
            setInitializing(false);
            return;
          }
          setUser(data.user);
          setStoredUser({ email: data.user.email, name: data.user.fullName });
          setProfile((prev) => profileForUser(prev, data.user));
          scheduleTokenRefresh(data.expiresInSeconds);
        } catch {
          if (!alive) return;
          // Só expulsa a sessão se nenhuma foi estabelecida entretanto — e só
          // se havia sessão para expirar (ver `hadSession`).
          if (!userRef.current && hadSession()) expireSession();
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
  }, [expireSession, setProfile, scheduleTokenRefresh, clearRefreshTimer]);

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
      // `bypassCache`: o perfil tem de vir sempre fresco. Com a cache em memória
      // (60s), um refresh logo após uma alteração (ex.: confirmar o email por
      // código) devolvia o objeto antigo e a UI não atualizava.
      const { data } = await apiGet<{ data: AuthUser }>("/api/auth/me", 0, true);
      setUser(data);
      setStoredUser({ email: data.email, name: data.fullName });
      setProfile((prev) => profileForUser(prev, data));
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
      setProfile((prev) => profileForUser(prev, data));
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

/**
 * Foto de perfil a apresentar.
 *
 * Com sessão iniciada vem sempre do servidor (`user.avatar`) — é o que garante
 * que cada conta mostra apenas a sua foto, mesmo depois de outra conta ter
 * usado o mesmo navegador. A cópia local (`nsm:profile`) só serve de apoio a
 * quem não tem sessão (o upload otimista antes de o PUT responder).
 */
export function useAvatarSrc(): string | null | undefined {
  const { user } = useAuth();
  const [profile] = useLocalStorageState<UserProfile | null>("nsm:profile", null);
  return user ? user.avatar : profile?.avatar;
}

