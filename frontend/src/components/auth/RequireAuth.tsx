"use client";

import { useAuth } from "@/context/AuthContext";
import { useLoginModal } from "@/context/LoginModalContext";
import { useCallback, useEffect, useRef } from "react";
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

  // Valores atuais via ref — o poll pós-clique lê o estado mais recente,
  // não o capturado no render em que o utilizador clicou.
  const stateRef = useRef({ user, initializing });
  const openLoginRef = useRef(openLogin);
  useEffect(() => {
    stateRef.current = { user, initializing };
    openLoginRef.current = openLogin;
  }, [user, initializing, openLogin]);

  /**
   * Executa a ação quando autenticado; se a sessão ainda estiver a carregar,
   * espera pela inicialização e repete a decisão (o clique não se perde).
   */
  const checkAuth = useCallback((onAuthenticated: () => void): boolean => {
    const decide = () => {
      const { user: u, initializing: init } = stateRef.current;
      if (init) return false; // continua a esperar
      if (!u) {
        openLoginRef.current();
      } else {
        onAuthenticated();
      }
      return true; // decisão tomada
    };
    if (!stateRef.current.initializing) {
      return decide();
    }
    const poll = () => {
      if (decide()) return;
      setTimeout(poll, 50);
    };
    queueMicrotask(poll);
    return false;
  }, []);

  return { checkAuth, isAuthenticated: !!user, initializing };
}