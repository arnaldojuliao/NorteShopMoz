"use client";

import { useAuth } from "@/context/AuthContext";
import { useLoginModal } from "@/context/LoginModalContext";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface RequireAuthProps {
  children: React.ReactNode;
  /** Se true, redireciona para login em vez de abrir modal (para páginas completas). */
  redirect?: boolean;
  /** Caminho para redirecionar após login (padrão: página atual). */
  fallbackPath?: string;
}

/**
 * Wrapper que exige autenticação.
 * - Se não autenticado: abre o modal de login (ou redireciona se redirect=true).
 * - Enquanto inicializa: mostra um spinner.
 * - Se autenticado: renderiza os children.
 */
export function RequireAuth({ children, redirect = false, fallbackPath = "/" }: RequireAuthProps) {
  const { user, initializing } = useAuth();
  const { openLogin } = useLoginModal();
  const router = useRouter();

  useEffect(() => {
    if (!initializing && !user) {
      if (redirect) {
        // Para páginas completas: redireciona para home com modal aberto
        router.replace(fallbackPath);
        // O modal será aberto pela página de login (/entrar) ou podemos abrir aqui
        queueMicrotask(() => openLogin());
      } else {
        // Para componentes inline: abre modal diretamente
        openLogin();
      }
    }
  }, [user, initializing, redirect, router, fallbackPath, openLogin]);

  if (initializing) {
    return (
      <div className="flex h-64 items-center justify-center" aria-busy="true" aria-label="A verificar sessão...">
        <Loader2 className="size-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!user) {
    return null; // O modal/login redireciona é tratado no useEffect
  }

  return <>{children}</>;
}

/**
 * Hook para verificar se o utilizador está autenticado e abrir login se necessário.
 * Útil para botões/ações que precisam de autenticação (ex.: CTA do Hero, botões de adicionar ao carrinho).
 */
export function useRequireAuth() {
  const { user, initializing } = useAuth();
  const { openLogin } = useLoginModal();

  const checkAuth = (onAuthenticated: () => void) => {
    if (initializing) return false; // Ainda a carregar, não faz nada
    if (!user) {
      openLogin();
      return false;
    }
    onAuthenticated();
    return true;
  };

  return { checkAuth, isAuthenticated: !!user, initializing };
}