"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, MailCheck, XCircle, RotateCcw, Mail } from "lucide-react";
import { apiPost, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/lib/utils";

type State =
  | { status: "verifying" }
  | { status: "success"; email: string }
  | { status: "error"; message: string; canResend: boolean };

function VerifyEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { notify } = useToast();
  const [state, setState] = useState<State>({ status: "verifying" });
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Auto-redirect after successful verification
  useEffect(() => {
    if (state.status === "success") {
      const timer = setTimeout(() => {
        router.push("/configuracoes");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.status, router]);

  // Countdown for resend button
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const verify = async () => {
    if (!token) {
      setState({ status: "error", message: "Link de verificação inválido — falta o token.", canResend: false });
      return;
    }
    try {
      const { data } = await apiPost<{ data: { email: string } }>("/api/auth/verify-email", { token });
      setState({ status: "success", email: data.email });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Não foi possível verificar o email.";
      // Check if it's an expired token (can resend)
      const canResend = err instanceof ApiError && err.message.includes("expirado");
      setState({ status: "error", message, canResend });
    }
  };

  const resendVerification = async () => {
    if (resendLoading) return;
    setResendLoading(true);
    try {
      await apiPost("/api/auth/resend-verification", {});
      notify("Novo link de verificação enviado! Verifique o seu email.");
      setCountdown(60); // 60 seconds cooldown
      setState(prev => prev.status === "error" ? { ...prev, canResend: false } : prev);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Não foi possível reenviar o email.";
      notify(message, "error");
    } finally {
      setResendLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    const doVerify = async () => {
      if (!token) {
        setState({ status: "error", message: "Link de verificação inválido — falta o token.", canResend: false });
        return;
      }
      try {
        const { data } = await apiPost<{ data: { email: string } }>("/api/auth/verify-email", { token });
        if (alive) setState({ status: "success", email: data.email });
      } catch (err) {
        if (!alive) return;
        const message = err instanceof ApiError ? err.message : "Não foi possível verificar o email.";
        const canResend = err instanceof ApiError && err.message.includes("expirado");
        setState({ status: "error", message, canResend });
      }
    };
    void doVerify();
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <div className="container-nsm flex justify-center py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-card">
        {state.status === "verifying" && (
          <>
            <Loader2 className="mx-auto size-12 animate-spin text-primary-600" aria-hidden />
            <h1 className="mt-4 font-display text-xl font-extrabold text-slate-900">
              A confirmar o seu email…
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">Um momento, por favor.</p>
          </>
        )}

        {state.status === "success" && (
          <>
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="size-9 text-emerald-600" aria-hidden />
            </span>
            <h1 className="mt-4 font-display text-xl font-extrabold text-slate-900">
              Email confirmado com sucesso!
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
              <span className="font-semibold text-slate-700">{state.email}</span> está verificado.
              Já pode comprar, guardar favoritos e acompanhar os seus pedidos.
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <Button href="/configuracoes" className="w-full">
                Ir para a minha conta
              </Button>
              <Button href="/" variant="outline" fullWidth>
                Continuar a comprar
              </Button>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Redirecionando para a sua conta em 3 segundos...
            </p>
          </>
        )}

        {state.status === "error" && (
          <>
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-red-100">
              <XCircle className="size-9 text-red-600" aria-hidden />
            </span>
            <h1 className="mt-4 font-display text-xl font-extrabold text-slate-900">
              Não foi possível confirmar o email
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{state.message}</p>
            
            {state.canResend && (
              <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <p className="flex items-center justify-center gap-1.5 text-xs text-amber-700 mb-3">
                  <Mail className="size-3.5" />
                  O link expirou ou é inválido. Pode pedir um novo link de verificação.
                </p>
                <Button
                  onClick={resendVerification}
                  disabled={resendLoading || countdown > 0}
                  variant="secondary"
                  fullWidth
                  className={cn("gap-2", countdown > 0 && "opacity-70")}
                >
                  <RotateCcw className={cn("size-3.5", resendLoading && "animate-spin")} />
                  {countdown > 0 ? (
                    <>Reenviar email ({countdown}s)</>
                  ) : (
                    <>Reenviar email de verificação</>
                  )}
                </Button>
              </div>
            )}

            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <MailCheck className="size-3.5" /> Pode pedir um novo link na sua conta
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <Button href="/configuracoes" variant="secondary" fullWidth>
                Ir para a minha conta
              </Button>
              <Button href="/entrar" variant="outline" fullWidth>
                Entrar
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}