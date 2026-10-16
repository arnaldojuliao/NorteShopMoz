"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { useLoginModal } from "@/context/LoginModalContext";
import { useLocalStorageState } from "@/lib/hooks";
import { getStoredUser } from "@/lib/orders";
import type { UserProfile } from "@/lib/types";

/**
 * Guarda de acesso para as páginas da conta.
 *
 * Distingue-se do `RequireAuth` genérico em dois pontos que importam a uma área
 * de conta:
 *  - aceita a **sessão local** (perfil guardado neste dispositivo, login offline
 *    sem token), como faz a página de configurações — sem isto um cliente com
 *    sessão validada voltava a ver o modal de login;
 *  - sessão **expirada** volta à página inicial em vez de deixar a página num
 *    estado meio-carregado.
 *
 * `initializing` é tratado como «à espera» (spinner), nunca como «sem sessão»:
 * caso contrário o modal de login abria a cada recarga.
 */
export function AccountGuard({ children }: { children: React.ReactNode }) {
  const { user, initializing, sessionExpired } = useAuth();
  const { openLogin } = useLoginModal();
  const [profile, , profileReady] = useLocalStorageState<UserProfile | null>(
    "nsm:profile",
    null,
  );

  // `nsm:user` é a marca de sessão local (email/nome) gravada pelo AuthContext.
  // A leitura ignora valores vazios: o checkout grava o valor por omissão do seu
  // armazenamento e, sem isto, um convidado que tivesse passado pelo checkout
  // entrava na área de conta como se tivesse sessão.
  const hasLocalSession =
    Boolean(profile?.fullName || profile?.email) || getStoredUser() != null;

  const allowed = Boolean(user) || hasLocalSession;

  // À espera: a autenticação a arrancar OU o perfil local ainda por ler. Sem o
  // segundo, o guard decidia com o valor por omissão (`null`) e abria o modal de
  // login a quem TEM sessão local neste dispositivo — o perfil chega só depois
  // (microtask), quando o arranque da autenticação já terminou.
  const waiting = initializing || !profileReady;

  useEffect(() => {
    if (waiting) return;
    if (sessionExpired) return; // o AuthContext já reencaminha para a home
    if (allowed) return;
    openLogin();
  }, [waiting, sessionExpired, allowed, openLogin]);

  if (waiting) {
    return (
      <div className="flex h-64 items-center justify-center" aria-busy="true" aria-label="A verificar sessão...">
        <Loader2 className="size-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!allowed) {
    // O modal de login abriu no efeito acima. O fundo deixou de ficar vazio: a
    // página não tinha conteúdo nenhum **nem `<h1>`**, portanto quem fechasse o
    // modal sem entrar ficava com um ecrã em branco e os leitores de ecrã sem
    // contexto da área onde estão.
    return (
      <div className="container-nsm py-16 text-center">
        <h1 className="font-display text-2xl font-extrabold text-slate-900">
          Entre na sua conta
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Esta área mostra os seus pedidos, favoritos e endereços depois de
          iniciar sessão.
        </p>
        <Button onClick={openLogin} size="lg" className="mt-6">
          Entrar / Registar-se
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}