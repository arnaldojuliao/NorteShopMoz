"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff, KeyRound, MailCheck, ShieldCheck } from "lucide-react";
import { apiPost, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LogoMark } from "@/components/ui/Logo";

function ForgotPasswordContent() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const requestReset = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiPost<{ data: { message: string } }>("/api/auth/forgot-password", { email });
      setDone(data.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível enviar o email.");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("As palavras-passe não coincidem");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiPost<{ data: { message: string } }>("/api/auth/reset-password", {
        token,
        password,
      });
      setDone(data.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível repor a palavra-passe.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-nsm flex justify-center py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          <LogoMark className="size-14 rounded-2xl text-lg" />
          <h1 className="mt-4 font-display text-2xl font-extrabold text-slate-900">
            {token ? "Repor palavra-passe" : "Recuperar palavra-passe"}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {token
              ? "Escolha uma nova palavra-passe para a sua conta."
              : "Enviámos um link de recuperação para o seu email."}
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
          {done ? (
            <div className="flex flex-col items-center py-4 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="size-9 text-emerald-600" aria-hidden />
              </span>
              <h3 className="mt-4 font-display text-lg font-extrabold text-slate-900">Tudo pronto!</h3>
              <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-slate-500">{done}</p>
              {token ? (
                <Button href="/entrar" className="mt-6 w-full">
                  Entrar com a nova palavra-passe
                </Button>
              ) : (
                <Link
                  href="/entrar"
                  className="mt-6 text-sm font-semibold text-primary-700 hover:underline"
                >
                  Voltar para o início de sessão
                </Link>
              )}
            </div>
          ) : token ? (
            <form onSubmit={resetPassword} className="space-y-4">
              <div className="relative">
                <Input
                  name="password"
                  type={showPw ? "text" : "password"}
                  label="Nova palavra-passe"
                  required
                  minLength={6}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                  className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center text-slate-400 transition hover:text-slate-600"
                >
                  {showPw ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
                </button>
              </div>
              <div className="relative">
                <Input
                  name="confirmPassword"
                  type={showPw ? "text" : "password"}
                  label="Confirmar palavra-passe"
                  required
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                  className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center text-slate-400 transition hover:text-slate-600"
                >
                  {showPw ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
                </button>
              </div>
              <Button type="submit" fullWidth size="lg" loading={loading}>
                <ShieldCheck className="size-4" /> Repor palavra-passe
              </Button>
            </form>
          ) : (
            <form onSubmit={requestReset} className="space-y-4">
              <Input
                name="email"
                type="email"
                label="Email da conta"
                required
                placeholder="nome@email.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" fullWidth size="lg" loading={loading}>
                <MailCheck className="size-4" /> Enviar link de recuperação
              </Button>
              <Link
                href="/entrar"
                className="block text-center text-sm font-semibold text-primary-700 hover:underline"
              >
                Lembrei-me — voltar a entrar
              </Link>
            </form>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-600"
            >
              {error}
            </p>
          )}
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
          <KeyRound className="size-3.5" /> O link é válido por 1 hora e só pode ser usado uma vez.
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordContent />
    </Suspense>
  );
}
