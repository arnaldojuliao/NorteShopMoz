"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiPost, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

/** Validade do código de verificação (sincronizada com o backend: 15 min). */
const CODE_VALIDITY_SECONDS = 15 * 60;

/** Dígitos do código de verificação (espelho do `newVerificationCode` do backend). */
export const CODE_LENGTH = 6;

/**
 * Confirmação de email pelo código de 6 dígitos recebido no email.
 *
 * O endpoint (`POST /api/auth/verify-email-code`) é **autenticado** — é a sessão
 * que identifica a conta, não o código —, por isso o hook só é útil em ecrãs com
 * o utilizador ligado. Reúne o estado e o envio partilhados pelos três sítios que
 * pedem o código: `Configurações` (modal «Confirmar email»), a página
 * `/verificar-email` e o ecrã de boas-vindas do registo.
 *
 * O código vale 15 minutos (`CODE_VALIDITY_SECONDS`, espelho do `CODE_TTL` do
 * backend): o contador corre a partir de `startValidity()` — chamado quando o ecrã
 * do código aparece — e ao chegar a zero o código é rejeitado, obrigando a pedir
 * um novo (`resend` repor o contador).
 */
export function useEmailVerificationCode() {
  const { refresh, resendVerification } = useAuth();
  const { notify } = useToast();
  const [code, setCodeState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(CODE_VALIDITY_SECONDS);

  const codeExpired = secondsLeft <= 0;

  /**
   * Tempo restante legível (`mm:ss`). Com uma validade de 15 minutos, mostrar os
   * segundos crus ("Expira em 899s") não diz nada a quem lê.
   */
  const expiresLabel = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  /** Reinicia a validade — quando o ecrã do código aparece ou após reenvio. */
  const startValidity = useCallback(() => setSecondsLeft(CODE_VALIDITY_SECONDS), []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  /** Escrever limpa o erro — a mensagem deixa de corresponder ao valor atual. */
  const setCode = useCallback((value: string) => {
    setCodeState(value);
    setError(null);
  }, []);

  /** Submete o código (aceita o evento do formulário). `true` se ficou confirmado. */
  const submit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      if (codeExpired) {
        setError("O código expirou — peça um novo código de verificação.");
        return false;
      }
      if (code.length !== CODE_LENGTH) {
        setError(`Insira os ${CODE_LENGTH} dígitos do código.`);
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
    [code, codeExpired, refresh, notify],
  );

  /** Pede um código novo (o antigo é invalidado após 5 erros ou 15 minutos). */
  const resend = useCallback(async () => {
    try {
      await resendVerification();
      setError(null);
      setCodeState("");
      setSecondsLeft(CODE_VALIDITY_SECONDS);
      notify("Enviámos um novo código para o seu email.");
      return true;
    } catch {
      notify("Não foi possível reenviar o código. Tente novamente.", "error");
      return false;
    }
  }, [resendVerification, notify]);

  return {
    code,
    setCode,
    error,
    verifying,
    submit,
    resend,
    secondsLeft,
    expiresLabel,
    codeExpired,
    startValidity,
  };
}
