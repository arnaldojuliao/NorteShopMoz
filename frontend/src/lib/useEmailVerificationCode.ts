"use client";

import { useCallback, useState, type FormEvent } from "react";
import { apiPost, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

/**
 * Confirmação de email pelo código de 6 dígitos recebido no email.
 *
 * O endpoint (`POST /api/auth/verify-email-code`) é **autenticado** — é a sessão
 * que identifica a conta, não o código —, por isso o hook só é útil em ecrãs com
 * o utilizador ligado. Reúne o estado e o envio partilhados pelos três sítios que
 * pedem o código: `Configurações` (modal «Confirmar email»), a página
 * `/verificar-email` e o ecrã de boas-vindas do registo.
 */
export function useEmailVerificationCode() {
  const { refresh, resendVerification } = useAuth();
  const { notify } = useToast();
  const [code, setCodeState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  /** Escrever limpa o erro — a mensagem deixa de corresponder ao valor atual. */
  const setCode = useCallback((value: string) => {
    setCodeState(value);
    setError(null);
  }, []);

  /** Submete o código (aceita o evento do formulário). `true` se ficou confirmado. */
  const submit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      if (code.length !== 6) {
        setError("Insira os 6 dígitos do código.");
        return false;
      }
      setVerifying(true);
      setError(null);
      try {
        await apiPost("/api/auth/verify-email-code", { code });
        // O perfil tem de vir fresco: com a cache de 60s o ecrã continuava a
        // mostrar o aviso «Email não verificado» depois de confirmar.
        await refresh();
        setCodeState("");
        notify("Email confirmado! A sua conta está verificada. ✅");
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Não foi possível verificar agora. Verifique a ligação e tente novamente.",
        );
        return false;
      } finally {
        setVerifying(false);
      }
    },
    [code, refresh, notify],
  );

  /** Pede um código novo (o antigo é invalidado após 5 erros ou 24 horas). */
  const resend = useCallback(async () => {
    try {
      await resendVerification();
      setError(null);
      notify("Enviámos um novo código para o seu email.");
      return true;
    } catch {
      notify("Não foi possível reenviar o código. Tente novamente.", "error");
      return false;
    }
  }, [resendVerification, notify]);

  return { code, setCode, error, verifying, submit, resend };
}
